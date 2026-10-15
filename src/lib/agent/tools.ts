// ============================================================
// FinanceBro agent tools. WorkBuddy's agents call these over MCP
// (/api/mcp). The agent decides what to do; every RM figure it
// states comes from here, worked out by the same functions the
// app's pages use.
//
// FinanceBro tracks one personal profile's PayLater (BNPL) plans.
// Nothing here moves money: payments are records of payments the
// user already made.
// ============================================================

import {
  createDebt,
  fetchProfileData,
  fetchSafetyBufferPct,
  insertExpectedIncome,
  logAgentActivity,
  recordDebtPayment,
  studentProfileId,
  type IncomeSource,
} from "../db";
import { netCash, cashFlow } from "../cashflow";
import { safeToSpend } from "../safeToSpend";
import { buildPayments, debtBreakdown, debtOverview, extraPaymentScenario, filterPayments, type PaymentFilter } from "../debt/payments";
import { generateSchedule, isValidDate } from "../debt/schedule";
import { debtSchedule } from "../reports";

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

/** The profile's PayLater plans, with today's cash balance worked out the same way as the app. */
async function load() {
  const data = await fetchProfileData();
  const today = todayMY();
  const balance = (cents(data.profile.startingBalance) + cents(netCash(data.transactions))) / 100;
  const payments = buildPayments(data.debts, [], today);
  return { ...data, today, balance, payments };
}

async function safeToSpendFor(ctx: Awaited<ReturnType<typeof load>>) {
  return safeToSpend({
    balance: ctx.balance,
    transactions: ctx.transactions,
    payments: ctx.payments,
    incomeSchedule: ctx.incomeSchedule,
    safetyBufferPct: await fetchSafetyBufferPct(ctx.profile.id),
    today: ctx.today,
  });
}

// ---------- schemas ----------

const DATE = { type: "string", description: "YYYY-MM-DD" };
const AMOUNT = { type: "number", description: "Ringgit (MYR), above 0" };

const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

// ---------- tools ----------

export const TOOLS: ToolDef[] = [
  {
    name: "get_snapshot",
    description:
      "Start here. The user's PayLater picture today: total owed, owed per provider, what's due in the next 7 days, this month and overdue, " +
      "the next instalment, cash now and the projection to month end after instalments, and safe-to-spend until the next income. " +
      "Use these figures as-is; never compute money yourself.",
    inputSchema: obj({}, []),
    write: false,
    async run() {
      const ctx = await load();
      const flow = cashFlow({ transactions: ctx.transactions, balance: ctx.balance, payments: ctx.payments, incomeSchedule: ctx.incomeSchedule, today: ctx.today });
      const debt = debtOverview(ctx.debts, ctx.payments, ctx.balance, ctx.today);
      const sts = await safeToSpendFor(ctx);
      return {
        summary: `${ctx.profile.displayName}: ${rm(debt.totalOutstanding)} owed on ${debt.activeDebts} PayLater plans, ${rm(debt.dueNext7Days)} due in 7 days, ${rm(debt.overdue)} overdue.`,
        data: {
          profile: { name: ctx.profile.displayName, currency: "MYR", today: ctx.today },
          paylater: {
            totalOutstanding: debt.totalOutstanding,
            activePlans: debt.activeDebts,
            owedByProvider: debtBreakdown(ctx.debts, ctx.payments, "outstanding", ctx.today),
            dueNext7Days: debt.dueNext7Days,
            dueThisMonth: debt.dueThisMonth,
            overdue: debt.overdue,
            overdueByProvider: debtBreakdown(ctx.debts, ctx.payments, "overdue", ctx.today),
            nextPayment: debt.nextPayment && { provider: debt.nextPayment.payee, dueDate: debt.nextPayment.dueDate, amount: debt.nextPayment.remaining },
          },
          cash: {
            balance: ctx.balance,
            monthEnd: flow.monthEnd,
            expectedIncomeConfirmed: flow.expectedIncomeConfirmed,
            expectedIncomeUnconfirmed: flow.expectedIncomeUnconfirmed,
            instalmentsDueByMonthEnd: flow.debtRepaymentsDue,
            projectedCashAtMonthEnd: flow.projectedCash,
          },
          safeToSpend: sts,
          upcomingIncome: ctx.incomeSchedule.filter((i) => i.expectedDate >= ctx.today),
        },
      };
    },
  },
  {
    name: "list_debts",
    description: "Every PayLater plan with its provider, what was bought, outstanding balance, terms, next instalment and the remaining unpaid schedule. Use the ids for record_debt_payment and debt_payoff_scenario.",
    inputSchema: obj({ include_closed: { type: "boolean" } }, []),
    write: false,
    async run(a) {
      const ctx = await load();
      const debts = ctx.debts.filter((d) => a.include_closed || d.status === "active");
      return {
        summary: `${debts.length} PayLater plans.`,
        data: debts.map((d) => ({
          id: d.id, provider: d.name, bought: d.notes, status: d.status,
          originalAmount: d.originalAmount, outstandingBalance: d.outstandingBalance,
          repaymentAmount: d.repaymentAmount, frequency: d.frequency,
          interestRatePct: d.interestRate ?? "unknown", orderNo: d.referenceNo, isSample: d.isSample,
          nextInstalment: d.nextInstalment && { id: d.nextInstalment.id, dueDate: d.nextInstalment.dueDate, remaining: d.nextInstalment.remaining, status: d.nextInstalment.status },
          unpaidSchedule: d.instalments.filter((i) => i.remaining > 0).map((i) => ({ dueDate: i.dueDate, remaining: i.remaining, status: i.status })),
          unscheduledBalance: d.unscheduledBalance,
        })),
      };
    },
  },
  {
    name: "list_payments_due",
    description: "Which PayLater instalments the user needs to pay, sorted by due date, with the period total (paid and cancelled excluded).",
    inputSchema: obj({ period: { type: "string", enum: ["today", "next7", "month", "overdue", "paid", "all"], description: "Default next7" } }, []),
    write: false,
    async run(a) {
      const ctx = await load();
      const period = oneOf<PaymentFilter>(a, "period", ["today", "next7", "month", "overdue", "paid", "all"], "next7");
      const items = filterPayments(ctx.payments, period, ctx.today);
      const total = items.reduce((s, p) => s + cents(p.remaining), 0) / 100;
      return {
        summary: `${items.length} instalments (${period}), ${rm(total)} still to pay.`,
        data: {
          period, totalStillToPay: total,
          items: items.map((p) => ({
            provider: p.payee, dueDate: p.dueDate, amount: p.amount, paid: p.amountPaid, remaining: p.remaining, status: p.status,
            debtId: p.debtId, instalment: p.instalmentNo && `${p.instalmentNo} of ${p.instalmentCount}`,
          })),
        },
      };
    },
  },
  {
    name: "check_affordability",
    description:
      "Can the user take on a new PayLater plan or make a purchase? Compares the amount due before the next income (the first instalment, or the full price) " +
      "with safe-to-spend (balance + confirmed income − PayLater instalments due before the next income − safety buffer).",
    inputSchema: obj({ amount: { ...AMOUNT, description: "RM the user would pay before their next income" } }, ["amount"]),
    write: false,
    async run(a) {
      const ctx = await load();
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
    description: "What paying an extra lump sum on one PayLater plan now would do: new outstanding balance, how many instalments it clears, the new payoff date, and interest saved (only when the plan's rate is known). Use it to compare which plan to clear first.",
    inputSchema: obj({ debt_id: { type: "string" }, extra: AMOUNT }, ["debt_id", "extra"]),
    write: false,
    async run(a) {
      const ctx = await load();
      const debt = ctx.debts.find((d) => d.id === str(a, "debt_id"));
      if (!debt) throw new ToolInputError("No PayLater plan with that id. Call list_debts.");
      const s = extraPaymentScenario(debt, money(a, "extra")!, ctx.today);
      return { summary: `${debt.name}: ${rm(s.extra)} extra leaves ${rm(s.outstandingAfter)}.`, data: { provider: debt.name, ...s } };
    },
  },
  {
    name: "generate_report",
    description:
      "Create the PayLater schedule report (every active plan and each instalment still to pay, month by month) and get a link to open it. " +
      "On the report page the user can download CSV or save it as a PDF. Give the user the link exactly as returned.",
    inputSchema: obj({}, []),
    write: false,
    async run() {
      const ctx = await load();
      const link = "/reports";
      const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
      const r = debtSchedule(ctx.debts, ctx.today);
      return {
        summary: `PayLater schedule: ${rm(r.totalOutstanding)} owed on ${r.debts.length} plans.`,
        data: {
          profile: ctx.profile.displayName, link, url: base ? `${base}${link}` : undefined, actions: "On the report: CSV download, Save as PDF",
          title: `PayLater schedule · as of ${ctx.today}`,
          totalOutstanding: r.totalOutstanding,
          unscheduled: r.unscheduled,
          plans: r.debts.map((d) => ({ provider: d.name, outstanding: d.outstanding, nextDue: d.nextDue, finalDue: d.finalDue, instalmentsLeft: d.instalmentsLeft })),
          nextMonths: r.months.slice(0, 3).map((m) => ({ month: m.month, stillToPay: m.total })),
        },
      };
    },
  },

  // ---------- writes ----------

  {
    name: "add_debt",
    description:
      "Add a PayLater (BNPL) plan the user took, with a repayment schedule built from its terms. Every term must come from the user or their screenshot: " +
      "never invent the total, instalment amount, frequency, first due date or interest rate. Ask for anything missing.",
    inputSchema: obj(
      {
        provider: { type: "string", description: "e.g. Shopee PayLater, TikTok PayLater, Grab PayLater, Atome" },
        bought: { type: "string", description: "What was bought, e.g. Wireless earbuds" },
        original_amount: { ...AMOUNT, description: "Total the user agreed to pay back" },
        outstanding_balance: { ...AMOUNT, description: "Still owed now (defaults to original_amount)" },
        frequency: { type: "string", enum: ["one_time", "weekly", "biweekly", "monthly"] },
        repayment_amount: { ...AMOUNT, description: "Each instalment; required unless one_time" },
        first_due_date: DATE,
        interest_rate: { type: "number", description: "% per year, only if the user stated it" },
        order_no: { type: "string" },
        purchase_date: DATE,
      },
      ["provider", "original_amount", "frequency", "first_due_date"]
    ),
    write: true,
    async run(a) {
      const ctx = await load();
      const frequency = oneOf(a, "frequency", ["one_time", "weekly", "biweekly", "monthly"] as const);
      const original = money(a, "original_amount")!;
      const outstanding = money(a, "outstanding_balance", false) ?? original;
      if (outstanding > original) throw new ToolInputError("Outstanding balance can't be more than the original amount.");
      const repayment = frequency === "one_time" ? undefined : money(a, "repayment_amount");
      const schedule = generateSchedule({ amount: outstanding, frequency, firstDueDate: date(a, "first_due_date"), instalmentAmount: repayment });
      const rate = a.interest_rate === undefined ? undefined : Number(a.interest_rate);
      if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) throw new ToolInputError("interest_rate must be a % of 0 or more.");
      const provider = str(a, "provider")!;
      await createDebt(ctx.profile.id, {
        name: provider, debtType: "bnpl", originalAmount: original, outstandingBalance: outstanding, repaymentAmount: repayment, frequency,
        interestRate: rate, startDate: a.purchase_date ? date(a, "purchase_date") : undefined,
        referenceNo: str(a, "order_no", false), notes: str(a, "bought", false),
      }, schedule);
      return {
        summary: `Added ${provider}: ${rm(outstanding)} owed, ${schedule.length} instalment${schedule.length === 1 ? "" : "s"} from ${schedule[0].due_date}.`,
        data: { schedule },
      };
    },
  },
  {
    name: "record_debt_payment",
    description:
      "Record a PayLater instalment the user already paid. It's applied to the plan's next unpaid instalment; a partial payment is fine. " +
      "Paying more than that instalment is refused. Pass interest only if the user says part of the payment was interest or late fees. " +
      "The same payment (plan, amount, date) is only ever recorded once.",
    inputSchema: obj({ debt_id: { type: "string" }, amount: AMOUNT, paid_date: { ...DATE, description: "default today" }, interest: { type: "number", description: "RM of the amount that was interest/late fees, default 0" } }, ["debt_id", "amount"]),
    write: true,
    async run(a) {
      const ctx = await load();
      const debt = ctx.debts.find((d) => d.id === str(a, "debt_id"));
      if (!debt) throw new ToolInputError("No PayLater plan with that id. Call list_debts.");
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
    description: "Add income the user expects (allowance, salary, PTPTN). Set confirmed only if the user says it's certain. Affordability and the month-end projection use it.",
    inputSchema: obj({ source: { type: "string", enum: ["allowance", "salary", "PTPTN", "other"] }, amount: AMOUNT, expected_date: DATE, confirmed: { type: "boolean" } }, ["source", "amount", "expected_date"]),
    write: true,
    async run(a) {
      const ctx = await load();
      const source = oneOf<IncomeSource>(a, "source", ["allowance", "salary", "PTPTN", "other"]);
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
  try {
    await logAgentActivity(await studentProfileId(), { tool: name, input: args, ok, summary, isWrite: tool.write });
  } catch {}
  return { ok, text };
}
