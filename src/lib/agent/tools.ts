// ============================================================
// FinanceBro agent tools. WorkBuddy's agents call these over MCP
// (/api/mcp). The agent decides what to do; every RM figure it
// states comes from here, worked out by the same functions the
// app's pages use.
//
// Nothing here moves money: payments are records of payments the
// user already made.
// ============================================================

import { AppMode, DebtType, Transaction } from "../types";
import {
  createDebt,
  fetchBudgetLines,
  fetchProfileData,
  insertCommitment,
  insertExpectedIncome,
  insertTransaction,
  logAgentActivity,
  profileIdFor,
  markCommitmentPaidOnce,
  recordDebtPayment,
  updateTransactionRow,
  upsertBudget,
  type IncomeSource,
} from "../db";
import { netCash, cashFlow } from "../cashflow";
import { safeToSpend } from "../safeToSpend";
import { buildPayments, debtOverview, extraPaymentScenario, filterPayments, type PaymentFilter } from "../debt/payments";
import { generateSchedule, isValidDate } from "../debt/schedule";
import { debtSchedule, monthLabel, monthlySummary, reportMonths, spendingByCategory } from "../reports";
import { BILL_CATEGORIES, TRANSACTION_CATEGORIES, spendingCategories } from "../categories";
import { BUSINESS_DEBT_TYPES, PERSONAL_DEBT_TYPES } from "../debt/labels";

type Args = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Changes data (logged as a write in the activity feed). */
  write: boolean;
  run: (args: Args) => Promise<{ summary: string; data: unknown }>;
}

/** Thrown for bad input: the message goes back to the agent so it can ask the user or retry. */
class ToolInputError extends Error {}

// ---------- helpers ----------

/** Today in Malaysia (the server runs in UTC). */
export function todayMY(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

const cents = (n: number) => Math.round(n * 100);
const rm = (n: number) => `${n < 0 ? "-" : ""}RM${Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function str(a: Args, key: string, required = true): string | undefined {
  const v = a[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolInputError(`Missing "${key}". Ask the user for it; don't guess.`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolInputError(`"${key}" must be a string.`);
  return v.trim();
}

function money(a: Args, key: string, required = true): number | undefined {
  const v = a[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolInputError(`Missing "${key}". Ask the user for the amount; don't guess.`);
    return undefined;
  }
  const n = typeof v === "string" ? Number(v.replace(/^RM\s*/i, "").replace(/,/g, "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new ToolInputError(`"${key}" must be an amount above RM0.`);
  return cents(n) / 100;
}

function date(a: Args, key: string, fallback?: string): string {
  const v = (a[key] as string | undefined) || fallback;
  if (!v) throw new ToolInputError(`Missing "${key}" (YYYY-MM-DD).`);
  if (!isValidDate(v)) throw new ToolInputError(`"${key}" must be a real date as YYYY-MM-DD, got "${v}".`);
  return v;
}

function oneOf<T extends string>(a: Args, key: string, allowed: readonly T[], fallback?: T): T {
  const v = (a[key] as T | undefined) ?? fallback;
  if (v === undefined) throw new ToolInputError(`Missing "${key}". One of: ${allowed.join(", ")}.`);
  if (!allowed.includes(v)) throw new ToolInputError(`"${key}" must be one of: ${allowed.join(", ")}. Got "${v}".`);
  return v;
}

const modeOf = (a: Args) => oneOf<AppMode>(a, "mode", ["individual", "business"]);

/** Everything about one profile, with today's balance worked out the same way as the app. */
async function load(mode: AppMode) {
  const data = await fetchProfileData(mode);
  const today = todayMY();
  const balance = (cents(data.profile.startingBalance) + cents(netCash(data.transactions))) / 100;
  const payments = buildPayments(data.debts, data.commitments, today);
  return { ...data, today, balance, payments };
}

async function safeToSpendFor(ctx: Awaited<ReturnType<typeof load>>) {
  const month = `${ctx.today.slice(0, 7)}-01`;
  const { budgets, safetyBufferPct } = await fetchBudgetLines(ctx.profile.id, month);
  return safeToSpend({
    balance: ctx.balance,
    transactions: ctx.transactions,
    payments: ctx.payments,
    incomeSchedule: ctx.incomeSchedule,
    essentialBudgets: budgets.filter((b) => b.essential),
    safetyBufferPct,
    today: ctx.today,
  });
}

const txOut = (t: Transaction) => ({
  id: t.id, date: t.date, merchant: t.name, amount: t.amount, type: t.type, category: t.category,
  note: t.description, flag: t.flag, paidInCash: t.cashEffect,
});

// ---------- schemas ----------

const MODE = {
  type: "string",
  enum: ["individual", "business"],
  description: "Which profile: individual = the student / personal account, business = the business account. Ask the user if unclear.",
};
const DATE = { type: "string", description: "YYYY-MM-DD" };
const AMOUNT = { type: "number", description: "Ringgit (MYR), above 0" };

const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

// ---------- tools ----------

export const TOOLS: ToolDef[] = [
  {
    name: "get_snapshot",
    description:
      "Start here. The profile's full financial picture today: balance, this month's cash flow and projection to month end, " +
      "safe-to-spend and daily allowance until the next income, debt totals, what's due soon, spending by category, and data issues " +
      "(uncategorised or possible duplicate transactions). Use these figures as-is; never compute money yourself.",
    inputSchema: obj({ mode: MODE }, ["mode"]),
    write: false,
    async run(a) {
      const ctx = await load(modeOf(a));
      const month = ctx.today.slice(0, 7);
      const flow = cashFlow({ transactions: ctx.transactions, balance: ctx.balance, payments: ctx.payments, incomeSchedule: ctx.incomeSchedule, today: ctx.today });
      const debt = debtOverview(ctx.debts, ctx.payments, ctx.balance, ctx.today);
      const sts = await safeToSpendFor(ctx);
      const summary = monthlySummary(ctx.transactions, ctx.balance, ctx.commitments, month);
      const flagged = ctx.transactions.filter((t) => t.flag === "duplicate");
      const uncategorised = ctx.transactions.filter((t) => t.category === "Uncategorised");
      return {
        summary: `${ctx.profile.displayName}: balance ${rm(ctx.balance)}, safe to spend ${rm(sts.safeToSpend)} until ${sts.nextIncomeDate}.`,
        data: {
          profile: { name: ctx.profile.displayName, mode: ctx.profile.mode, currency: "MYR", today: ctx.today },
          balance: ctx.balance,
          safeToSpend: sts,
          cashFlowThisMonth: flow,
          thisMonth: {
            income: summary.income,
            spending: summary.spending,
            spentOnCredit: summary.spentOnCredit,
            debtRepayments: summary.debtRepayments,
            previousMonthSpending: summary.previousSpending,
            savingsRatePct: summary.savingsRate,
            byCategory: summary.categories.map((c) => ({ category: c.category, amount: c.amount, sharePct: c.share, lastMonth: c.previous })),
          },
          debt: {
            totalOutstanding: debt.totalOutstanding,
            activeDebts: debt.activeDebts,
            dueNext7Days: debt.dueNext7Days,
            dueThisMonth: debt.dueThisMonth,
            overdue: debt.overdue,
            nextPayment: debt.nextPayment && { payee: debt.nextPayment.payee, dueDate: debt.nextPayment.dueDate, amount: debt.nextPayment.remaining },
          },
          upcomingIncome: ctx.incomeSchedule.filter((i) => i.expectedDate >= ctx.today),
          dataIssues: {
            possibleDuplicates: flagged.map(txOut),
            uncategorised: uncategorised.map(txOut),
          },
        },
      };
    },
  },
  {
    name: "list_transactions",
    description: "Transactions, newest first. Filter by date range, category, type or a merchant search.",
    inputSchema: obj(
      {
        mode: MODE,
        from: DATE,
        to: DATE,
        category: { type: "string" },
        type: { type: "string", enum: ["income", "expense"] },
        search: { type: "string", description: "Part of the merchant name or note" },
        limit: { type: "number", description: "Default 50, max 200" },
      },
      ["mode"]
    ),
    write: false,
    async run(a) {
      const ctx = await load(modeOf(a));
      const q = (str(a, "search", false) ?? "").toLowerCase();
      const rows = ctx.transactions.filter(
        (t) =>
          (!a.from || t.date >= (a.from as string)) &&
          (!a.to || t.date <= (a.to as string)) &&
          (!a.category || t.category === a.category) &&
          (!a.type || t.type === a.type) &&
          (!q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q))
      );
      const limit = Math.min(Number(a.limit) || 50, 200);
      return { summary: `${rows.length} transactions match.`, data: { total: rows.length, transactions: rows.slice(0, limit).map(txOut) } };
    },
  },
  {
    name: "list_debts",
    description: "Every debt with its outstanding balance, terms, next instalment and the remaining unpaid schedule. Use the ids for record_debt_payment and debt_payoff_scenario.",
    inputSchema: obj({ mode: MODE, include_closed: { type: "boolean" } }, ["mode"]),
    write: false,
    async run(a) {
      const ctx = await load(modeOf(a));
      const debts = ctx.debts.filter((d) => a.include_closed || d.status === "active");
      return {
        summary: `${debts.length} debts.`,
        data: debts.map((d) => ({
          id: d.id, name: d.name, type: d.debtType, status: d.status,
          originalAmount: d.originalAmount, outstandingBalance: d.outstandingBalance,
          repaymentAmount: d.repaymentAmount, frequency: d.frequency,
          interestRatePct: d.interestRate ?? "unknown", referenceNo: d.referenceNo, notes: d.notes, isSample: d.isSample,
          nextInstalment: d.nextInstalment && { id: d.nextInstalment.id, dueDate: d.nextInstalment.dueDate, remaining: d.nextInstalment.remaining, status: d.nextInstalment.status },
          unpaidSchedule: d.instalments.filter((i) => i.remaining > 0).map((i) => ({ dueDate: i.dueDate, remaining: i.remaining, status: i.status })),
          unscheduledBalance: d.unscheduledBalance,
        })),
      };
    },
  },
  {
    name: "list_payments_due",
    description: "Who the user needs to pay: debt instalments and bills together, sorted by due date, with the period total (paid and cancelled excluded).",
    inputSchema: obj({ mode: MODE, period: { type: "string", enum: ["today", "next7", "month", "overdue", "paid", "all"], description: "Default next7" } }, ["mode"]),
    write: false,
    async run(a) {
      const ctx = await load(modeOf(a));
      const period = oneOf<PaymentFilter>(a, "period", ["today", "next7", "month", "overdue", "paid", "all"], "next7");
      const items = filterPayments(ctx.payments, period, ctx.today);
      const total = items.reduce((s, p) => s + cents(p.remaining), 0) / 100;
      return {
        summary: `${items.length} payments (${period}), ${rm(total)} still to pay.`,
        data: {
          period, totalStillToPay: total,
          items: items.map((p) => ({
            kind: p.kind, payee: p.payee, dueDate: p.dueDate, amount: p.amount, paid: p.amountPaid, remaining: p.remaining, status: p.status,
            debtId: p.debtId, billId: p.commitmentId, instalment: p.instalmentNo && `${p.instalmentNo} of ${p.instalmentCount}`,
          })),
        },
      };
    },
  },
  {
    name: "monthly_report",
    description: "One month in numbers: opening and closing cash, income, spending (cash and on credit), debt repayments, interest and fees, savings rate, spending by category vs the month before, the five biggest expenses, and budget lines with what's left.",
    inputSchema: obj({ mode: MODE, month: { type: "string", description: "YYYY-MM, default this month" } }, ["mode"]),
    write: false,
    async run(a) {
      const ctx = await load(modeOf(a));
      const month = (a.month as string | undefined) ?? ctx.today.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) throw new ToolInputError(`"month" must be YYYY-MM.`);
      const s = monthlySummary(ctx.transactions, ctx.balance, ctx.commitments, month);
      const { budgets } = await fetchBudgetLines(ctx.profile.id, `${month}-01`);
      const spent = new Map(s.categories.map((c) => [c.category, c.amount]));
      return {
        summary: `${month}: income ${rm(s.income)}, spending ${rm(s.spending)}.`,
        data: {
          ...s,
          biggest: s.biggest.map(txOut),
          budgets: budgets.map((b) => {
            const used = spent.get(b.category) ?? 0;
            return { ...b, spent: used, left: (cents(b.limit) - cents(used)) / 100 };
          }),
        },
      };
    },
  },
  {
    name: "check_affordability",
    description: "Can the user afford a purchase? Compares the amount with safe-to-spend (balance + confirmed income − bills and debt due before the next income − essential budget left − safety buffer).",
    inputSchema: obj({ mode: MODE, amount: AMOUNT }, ["mode", "amount"]),
    write: false,
    async run(a) {
      const ctx = await load(modeOf(a));
      const amount = money(a, "amount")!;
      const sts = await safeToSpendFor(ctx);
      const after = (cents(sts.safeToSpend) - cents(amount)) / 100;
      return {
        summary: after >= 0 ? `Affordable: ${rm(after)} safe-to-spend left after it.` : `Not affordable: ${rm(-after)} short of safe-to-spend.`,
        data: { amount, affordable: after >= 0, safeToSpendBefore: sts.safeToSpend, safeToSpendAfter: after, workings: sts },
      };
    },
  },
  {
    name: "debt_payoff_scenario",
    description: "What paying an extra lump sum on one debt now would do: new outstanding balance, how many instalments it clears, the new payoff date, and interest saved (only when the debt's rate is known). Use it to compare strategies (e.g. avalanche vs snowball) for a plan.",
    inputSchema: obj({ mode: MODE, debt_id: { type: "string" }, extra: AMOUNT }, ["mode", "debt_id", "extra"]),
    write: false,
    async run(a) {
      const ctx = await load(modeOf(a));
      const debt = ctx.debts.find((d) => d.id === str(a, "debt_id"));
      if (!debt) throw new ToolInputError("No debt with that id on this profile. Call list_debts.");
      const s = extraPaymentScenario(debt, money(a, "extra")!, ctx.today);
      return { summary: `${debt.name}: ${rm(s.extra)} extra leaves ${rm(s.outstandingAfter)}.`, data: { debt: debt.name, ...s } };
    },
  },

  {
    name: "generate_report",
    description:
      "Create a report with FinanceBro's report generator and get a link to open it. Reports: " +
      "monthly (income, spending, cash in and out, savings rate, biggest expenses), spending (by category, vs the month before), " +
      "debts (every active debt and each payment still to make, month by month). On the report page the user can download CSV or save it as a PDF. " +
      "Give the user the link exactly as returned.",
    inputSchema: obj(
      {
        mode: MODE,
        kind: { type: "string", enum: ["monthly", "spending", "debts"] },
        month: { type: "string", description: "YYYY-MM for monthly and spending, default this month. Not used for debts." },
      },
      ["mode", "kind"]
    ),
    write: false,
    async run(a) {
      const mode = modeOf(a);
      const ctx = await load(mode);
      const kind = oneOf(a, "kind", ["monthly", "spending", "debts"] as const);
      const months = reportMonths(ctx.transactions, ctx.today);
      const month = (a.month as string | undefined) ?? ctx.today.slice(0, 7);
      if (kind !== "debts" && !months.includes(month)) {
        throw new ToolInputError(`No report for "${month}". Months with records: ${months.join(", ")}.`);
      }
      const params = new URLSearchParams({ kind, mode, ...(kind === "debts" ? {} : { month }) });
      const link = `/reports?${params}`;
      const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
      const meta = { profile: ctx.profile.displayName, link, url: base ? `${base}${link}` : undefined, actions: "On the report: CSV download, Save as PDF" };

      if (kind === "monthly") {
        const s = monthlySummary(ctx.transactions, ctx.balance, ctx.commitments, month);
        return {
          summary: `Monthly summary for ${monthLabel(month)}: income ${rm(s.income)}, spending ${rm(s.spending)}.`,
          data: {
            ...meta,
            title: `Monthly summary · ${monthLabel(month)}`,
            highlights: {
              openingCash: s.openingCash, income: s.income, spending: s.spending, cashSpending: s.cashSpending,
              spentOnCredit: s.spentOnCredit, debtRepayments: s.debtRepayments, interestFees: s.interestFees,
              closingCash: s.closingCash, net: s.net, savingsRatePct: s.savingsRate, previousMonthSpending: s.previousSpending,
              topCategories: s.categories.slice(0, 3).map((c) => ({ category: c.category, amount: c.amount, sharePct: c.share })),
            },
          },
        };
      }
      if (kind === "spending") {
        const rows = spendingByCategory(ctx.transactions, month);
        const total = rows.reduce((t, r) => t + cents(r.amount), 0) / 100;
        return {
          summary: `Spending by category for ${monthLabel(month)}: ${rm(total)} across ${rows.filter((r) => r.amount > 0).length} categories.`,
          data: {
            ...meta,
            title: `Spending by category · ${monthLabel(month)}`,
            total,
            categories: rows.map((r) => ({ category: r.category, amount: r.amount, sharePct: r.share, items: r.count, lastMonth: r.previous })),
          },
        };
      }
      const r = debtSchedule(ctx.debts, ctx.today);
      return {
        summary: `Debt schedule: ${rm(r.totalOutstanding)} owed on ${r.debts.length} debts.`,
        data: {
          ...meta,
          title: `Debt schedule · as of ${ctx.today}`,
          totalOutstanding: r.totalOutstanding,
          unscheduled: r.unscheduled,
          debts: r.debts.map((d) => ({ name: d.name, outstanding: d.outstanding, nextDue: d.nextDue, finalDue: d.finalDue, instalmentsLeft: d.instalmentsLeft })),
          nextMonths: r.months.slice(0, 3).map((m) => ({ month: m.month, stillToPay: m.total })),
        },
      };
    },
  },

  // ---------- writes ----------

  {
    name: "add_transactions",
    description:
      "Record one or more transactions the user tells you about (\"spent RM12 on nasi lemak\", a pasted receipt or bank list). " +
      "Pick the category from the profile's list. A transaction with the same date, amount and merchant as an existing one is skipped as a duplicate " +
      "unless allow_duplicates is true. Debt repayments must go through record_debt_payment instead.",
    inputSchema: obj(
      {
        mode: MODE,
        transactions: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: obj(
            {
              date: { ...DATE, description: "YYYY-MM-DD, default today" },
              merchant: { type: "string", description: "Who was paid or who paid" },
              amount: AMOUNT,
              type: { type: "string", enum: ["income", "expense"] },
              category: { type: "string", description: "individual: " + TRANSACTION_CATEGORIES.individual.join(", ") + ". business: " + TRANSACTION_CATEGORIES.business.join(", ") },
              note: { type: "string" },
            },
            ["merchant", "amount", "type", "category"]
          ),
        },
        allow_duplicates: { type: "boolean" },
      },
      ["mode", "transactions"]
    ),
    write: true,
    async run(a) {
      const mode = modeOf(a);
      const ctx = await load(mode);
      const items = a.transactions;
      if (!Array.isArray(items) || items.length === 0) throw new ToolInputError(`"transactions" must be a non-empty list.`);
      const allowed = TRANSACTION_CATEGORIES[mode];
      // Validate everything first so a bad row doesn't leave half the list saved.
      const rows = items.map((raw: Args, i) => {
        const t = {
          date: date(raw, "date", ctx.today),
          name: str(raw, "merchant")!,
          amount: money(raw, "amount")!,
          type: oneOf(raw, "type", ["income", "expense"] as const),
          category: str(raw, "category")!,
          description: str(raw, "note", false),
        };
        if (!allowed.includes(t.category)) throw new ToolInputError(`Row ${i + 1}: category "${t.category}" isn't one of: ${allowed.join(", ")}.`);
        return t;
      });
      const seen = new Set(ctx.transactions.map((t) => `${t.date}|${cents(t.amount)}|${t.name.toLowerCase()}`));
      const added: unknown[] = [];
      const skipped: unknown[] = [];
      for (const t of rows) {
        const key = `${t.date}|${cents(t.amount)}|${t.name.toLowerCase()}`;
        if (seen.has(key) && !a.allow_duplicates) {
          skipped.push({ ...t, reason: "possible duplicate of an existing transaction" });
          continue;
        }
        seen.add(key);
        added.push(txOut(await insertTransaction(ctx.profile.id, mode, t, "agent")));
      }
      const addedTotal = (added as { amount: number }[]).reduce((t, x) => t + cents(x.amount), 0) / 100;
      return {
        summary: `Added ${added.length} transaction${added.length === 1 ? "" : "s"} (${rm(addedTotal)} in total)${skipped.length ? `, skipped ${skipped.length} possible duplicate${skipped.length === 1 ? "" : "s"}` : ""}.`,
        data: { added, skipped, addedTotal },
      };
    },
  },
  {
    name: "update_transaction",
    description: "Fix a transaction: re-categorise it, rename the merchant, or change its note, date or amount. Use ids from list_transactions or get_snapshot.",
    inputSchema: obj(
      { mode: MODE, id: { type: "string" }, category: { type: "string" }, merchant: { type: "string" }, note: { type: "string" }, date: DATE, amount: AMOUNT },
      ["mode", "id"]
    ),
    write: true,
    async run(a) {
      const mode = modeOf(a);
      const ctx = await load(mode);
      const t = ctx.transactions.find((x) => x.id === str(a, "id"));
      if (!t) throw new ToolInputError("No transaction with that id on this profile.");
      if (t.category === "Debt Repayment" || t.category === "Interest & Fees" || !t.cashEffect) {
        throw new ToolInputError("This transaction belongs to a debt record and can't be edited here.");
      }
      const u: Partial<Transaction> = {};
      if (a.category !== undefined) {
        const c = str(a, "category")!;
        if (!TRANSACTION_CATEGORIES[mode].includes(c)) throw new ToolInputError(`Category must be one of: ${TRANSACTION_CATEGORIES[mode].join(", ")}.`);
        u.category = c;
      }
      if (a.merchant !== undefined) u.name = str(a, "merchant");
      if (a.note !== undefined) u.description = (a.note as string) ?? "";
      if (a.date !== undefined) u.date = date(a, "date");
      if (a.amount !== undefined) u.amount = money(a, "amount");
      if (Object.keys(u).length === 0) throw new ToolInputError("Nothing to change.");
      await updateTransactionRow(ctx.profile.id, t.id, u);
      return { summary: `Updated ${t.name} (${t.date}).`, data: { before: txOut(t), changes: u } };
    },
  },
  {
    name: "set_budgets",
    description:
      "Create or replace monthly budget lines (one per category). Mark rent, utilities, food and similar needs as essential: " +
      "what's left of essential budgets is held back in safe-to-spend. Use this to put a financial plan into effect, after the user agrees to it.",
    inputSchema: obj(
      {
        mode: MODE,
        month: { type: "string", description: "YYYY-MM, default this month" },
        budgets: {
          type: "array",
          minItems: 1,
          items: obj({ category: { type: "string" }, limit: { type: "number", description: "RM, 0 or more" }, essential: { type: "boolean" } }, ["category", "limit", "essential"]),
        },
      },
      ["mode", "budgets"]
    ),
    write: true,
    async run(a) {
      const mode = modeOf(a);
      const ctx = await load(mode);
      const month = (a.month as string | undefined) ?? ctx.today.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) throw new ToolInputError(`"month" must be YYYY-MM.`);
      const allowed = spendingCategories(mode);
      const lines = (a.budgets as Args[]).map((b) => {
        const category = str(b, "category")!;
        if (!allowed.includes(category)) throw new ToolInputError(`Budget category "${category}" isn't one of: ${allowed.join(", ")}.`);
        const limit = Number(b.limit);
        if (!Number.isFinite(limit) || limit < 0) throw new ToolInputError(`Limit for ${category} must be RM0 or more.`);
        return { category, limit: cents(limit) / 100, essential: Boolean(b.essential) };
      });
      for (const l of lines) await upsertBudget(ctx.profile.id, `${month}-01`, l, "agent");
      const total = lines.reduce((s, l) => s + cents(l.limit), 0) / 100;
      return { summary: `Set ${lines.length} budget lines for ${month}, ${rm(total)} in total.`, data: { month, lines, total } };
    },
  },
  {
    name: "add_bill",
    description: "Add a bill the user has to pay (rent, utilities, internet, phone, a supplier bill). For money owed in instalments (BNPL, loans, cards) use add_debt.",
    inputSchema: obj(
      {
        mode: MODE,
        name: { type: "string" },
        amount: AMOUNT,
        due_date: DATE,
        category: { type: "string", description: "individual: " + BILL_CATEGORIES.individual.join(", ") + ". business: " + BILL_CATEGORIES.business.join(", ") },
        recurring_monthly: { type: "boolean" },
      },
      ["mode", "name", "amount", "due_date", "category"]
    ),
    write: true,
    async run(a) {
      const mode = modeOf(a);
      const ctx = await load(mode);
      const category = oneOf(a, "category", BILL_CATEGORIES[mode]);
      const bill = await insertCommitment(ctx.profile.id, mode, {
        name: str(a, "name")!, amount: money(a, "amount")!, dueDate: date(a, "due_date"), category, status: "upcoming", recurring: Boolean(a.recurring_monthly),
      });
      return { summary: `Added bill ${bill.name}, ${rm(bill.amount)} due ${bill.dueDate}.`, data: { id: bill.id, name: bill.name, amount: bill.amount, dueDate: bill.dueDate, category } };
    },
  },
  {
    name: "mark_bill_paid",
    description: "Record that the user paid a bill (records the expense once; a second call does nothing). Bill ids come from list_payments_due.",
    inputSchema: obj({ mode: MODE, bill_id: { type: "string" }, paid_date: { ...DATE, description: "YYYY-MM-DD, default today" } }, ["mode", "bill_id"]),
    write: true,
    async run(a) {
      const mode = modeOf(a);
      const ctx = await load(mode);
      const bill = ctx.commitments.find((c) => c.id === str(a, "bill_id"));
      if (!bill) throw new ToolInputError("No bill with that id on this profile. Call list_payments_due.");
      const done = await markCommitmentPaidOnce(ctx.profile.id, mode, bill, date(a, "paid_date", ctx.today));
      return { summary: done ? `Recorded payment of ${rm(bill.amount)} to ${bill.name}.` : `${bill.name} was already paid; nothing recorded.`, data: { recorded: done } };
    },
  },
  {
    name: "add_debt",
    description:
      "Add money the user owes, with a repayment schedule built from the terms. Every term must come from the user: " +
      "never invent the balance, repayment amount, frequency, due date or interest rate. Ask for anything missing. " +
      "If the debt paid for a purchase (BNPL, supplier invoice), set purchase_category so it counts as spending once.",
    inputSchema: obj(
      {
        mode: MODE,
        name: { type: "string", description: "Creditor / provider, e.g. Shopee PayLater" },
        debt_type: { type: "string", description: "individual: " + Object.keys(PERSONAL_DEBT_TYPES).join(", ") + ". business: " + Object.keys(BUSINESS_DEBT_TYPES).join(", ") },
        original_amount: AMOUNT,
        outstanding_balance: { ...AMOUNT, description: "Still owed now (defaults to original_amount)" },
        frequency: { type: "string", enum: ["one_time", "weekly", "biweekly", "monthly", "yearly"] },
        repayment_amount: { ...AMOUNT, description: "Each instalment; required unless one_time" },
        first_due_date: DATE,
        interest_rate: { type: "number", description: "% per year, only if the user stated it" },
        reference_no: { type: "string" },
        notes: { type: "string" },
        purchase_category: { type: "string", description: "Spending category of what was bought on credit, if any" },
        purchase_date: DATE,
      },
      ["mode", "name", "debt_type", "original_amount", "frequency", "first_due_date"]
    ),
    write: true,
    async run(a) {
      const mode = modeOf(a);
      const ctx = await load(mode);
      const types = Object.keys(mode === "individual" ? PERSONAL_DEBT_TYPES : BUSINESS_DEBT_TYPES) as DebtType[];
      const debtType = oneOf(a, "debt_type", types);
      const frequency = oneOf(a, "frequency", ["one_time", "weekly", "biweekly", "monthly", "yearly"] as const);
      const original = money(a, "original_amount")!;
      const outstanding = money(a, "outstanding_balance", false) ?? original;
      if (outstanding > original) throw new ToolInputError("Outstanding balance can't be more than the original amount.");
      const repayment = frequency === "one_time" ? undefined : money(a, "repayment_amount");
      const schedule = generateSchedule({ amount: outstanding, frequency, firstDueDate: date(a, "first_due_date"), instalmentAmount: repayment });
      let purchase;
      if (a.purchase_category !== undefined) {
        const category = str(a, "purchase_category")!;
        if (!spendingCategories(mode).includes(category)) throw new ToolInputError(`purchase_category must be one of: ${spendingCategories(mode).join(", ")}.`);
        purchase = { date: date(a, "purchase_date", ctx.today), category };
      }
      const rate = a.interest_rate === undefined ? undefined : Number(a.interest_rate);
      if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) throw new ToolInputError("interest_rate must be a % of 0 or more.");
      await createDebt(ctx.profile.id, {
        name: str(a, "name")!, debtType, originalAmount: original, outstandingBalance: outstanding, repaymentAmount: repayment, frequency,
        interestRate: rate, referenceNo: str(a, "reference_no", false), notes: str(a, "notes", false), purchase,
      }, schedule);
      return {
        summary: `Added ${a.name}: ${rm(outstanding)} owed, ${schedule.length} instalment${schedule.length === 1 ? "" : "s"} from ${schedule[0].due_date}.`,
        data: { schedule },
      };
    },
  },
  {
    name: "record_debt_payment",
    description:
      "Record a repayment the user already made towards a debt. It's applied to the next unpaid instalment; a partial payment is fine. " +
      "Paying more than that instalment is refused. Pass interest only if the user says part of the payment was interest or fees. " +
      "The same payment (debt, amount, date) is only ever recorded once.",
    inputSchema: obj({ mode: MODE, debt_id: { type: "string" }, amount: AMOUNT, paid_date: { ...DATE, description: "default today" }, interest: { type: "number", description: "RM of the amount that was interest/fees, default 0" } }, ["mode", "debt_id", "amount"]),
    write: true,
    async run(a) {
      const ctx = await load(modeOf(a));
      const debt = ctx.debts.find((d) => d.id === str(a, "debt_id"));
      if (!debt) throw new ToolInputError("No debt with that id on this profile. Call list_debts.");
      const inst = debt.nextInstalment;
      if (!inst) throw new ToolInputError(`${debt.name} has no unpaid instalment.`);
      const amount = money(a, "amount")!;
      const interest = a.interest === undefined ? 0 : Number(a.interest);
      if (!Number.isFinite(interest) || interest < 0 || interest >= amount) throw new ToolInputError("interest must be at least 0 and less than the amount.");
      const paidDate = date(a, "paid_date", ctx.today);
      if (cents(amount - interest) > cents(inst.remaining)) {
        throw new ToolInputError(`The next ${debt.name} instalment (due ${inst.dueDate}) only has ${rm(inst.remaining)} left. Record up to that, then the rest separately.`);
      }
      const r = await recordDebtPayment({
        instalmentId: inst.id, amount, paidDate, interest, idempotencyKey: `agent:${inst.id}:${cents(amount)}:${paidDate}`,
      });
      return {
        summary: r.duplicate ? "That payment was already recorded; nothing changed." : `Recorded ${rm(amount)} to ${debt.name}. ${rm(r.outstanding_balance ?? 0)} still owed.`,
        data: r,
      };
    },
  },
  {
    name: "add_expected_income",
    description: "Add income the user expects (allowance, salary, PTPTN, sales payout). Set confirmed only if the user says it's certain. Safe-to-spend runs to the next expected income.",
    inputSchema: obj({ mode: MODE, source: { type: "string", enum: ["allowance", "salary", "PTPTN", "sales", "other"] }, amount: AMOUNT, expected_date: DATE, confirmed: { type: "boolean" } }, ["mode", "source", "amount", "expected_date"]),
    write: true,
    async run(a) {
      const ctx = await load(modeOf(a));
      const source = oneOf<IncomeSource>(a, "source", ["allowance", "salary", "PTPTN", "sales", "other"]);
      const amount = money(a, "amount")!;
      const expectedDate = date(a, "expected_date");
      const id = await insertExpectedIncome(ctx.profile.id, { source, expectedAmount: amount, expectedDate, confirmed: Boolean(a.confirmed) });
      return { summary: `Expecting ${rm(amount)} (${source}) on ${expectedDate}.`, data: { id } };
    },
  },
];

/** Runs a tool and logs it to the activity feed. Bad input comes back as an error message, not a throw. */
export async function callTool(name: string, args: Args): Promise<{ ok: boolean; text: string }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, text: `Unknown tool "${name}".` };
  let ok = true;
  let summary: string;
  let text: string;
  try {
    const out = await tool.run(args ?? {});
    summary = out.summary;
    text = `${out.summary}\n\n${JSON.stringify(out.data, null, 1)}`;
  } catch (e) {
    ok = false;
    summary = e instanceof Error ? e.message : String(e);
    text = e instanceof ToolInputError ? summary : `Error: ${summary}`;
  }
  // Best effort: a failed log must not fail the tool call.
  const mode = args?.mode === "business" || args?.mode === "individual" ? args.mode : undefined;
  if (mode) {
    try {
      await logAgentActivity(await profileIdFor(mode), { tool: name, input: args, ok, summary, isWrite: tool.write });
    } catch {}
  }
  return { ok, text };
}
