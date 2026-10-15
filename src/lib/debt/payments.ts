// ============================================================
// "Who do I need to pay?" — one list of everything payable
// (debt instalments + bills), plus the debt dashboard totals.
// Pure functions: every date comparison uses YYYY-MM-DD strings
// against an explicit `today`, and money is summed in cents.
// ============================================================

import { AppMode, Debt, DebtFrequency, FinancialCommitment, InstalmentStatus } from "../types";
import { DEBT_TYPE_LABELS, FREQUENCY_LABELS } from "./labels";

export interface PaymentItem {
  key: string; // "inst:<id>" or "bill:<id>"
  kind: "debt" | "bill";
  mode: AppMode; // which profile it belongs to
  payee: string;
  /** What the PayLater plan paid for (the debt's notes). */
  bought?: string;
  category: string;
  frequency: string; // display label
  dueDate: string;
  amount: number; // scheduled amount
  amountPaid: number;
  remaining: number; // still to pay (0 when paid or cancelled)
  status: InstalmentStatus;
  paidDate?: string;
  debtId?: string;
  instalmentId?: string;
  commitmentId?: string;
  instalmentNo?: number;
  instalmentCount?: number;
}

export type PaymentFilter = "all" | "today" | "next7" | "month" | "overdue" | "paid";

export const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Due today" },
  { value: "next7", label: "Next 7 days" },
  { value: "month", label: "This month" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

const cents = (n: number) => Math.round(n * 100);
const sumCents = (items: PaymentItem[], f: (i: PaymentItem) => number) => items.reduce((s, i) => s + cents(f(i)), 0) / 100;

/** Whole days from `from` to `to` (both YYYY-MM-DD). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Last day of the month that `date` falls in. */
export function endOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Countdown text from the saved due date, e.g. "Due today", "Due in 2 days", "Overdue by 3 days". */
export function countdown(dueDate: string, today: string, status: InstalmentStatus): string {
  if (status === "paid") return "Paid";
  if (status === "cancelled") return "Cancelled";
  const d = daysBetween(today, dueDate);
  if (d < 0) return `Overdue by ${plural(-d, "day")}`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
}

const isUnpaid = (i: PaymentItem) => i.remaining > 0;

/**
 * Every payable item for the given debts and bills, sorted so the ones that
 * need attention come first: unpaid by nearest due date, then paid and
 * cancelled ones with the most recent first.
 */
export function buildPayments(debts: Debt[], bills: FinancialCommitment[], today: string): PaymentItem[] {
  const items: PaymentItem[] = [];

  for (const debt of debts) {
    debt.instalments.forEach((inst, idx) => {
      items.push({
        key: `inst:${inst.id}`,
        kind: "debt",
        mode: debt.mode,
        payee: debt.name,
        bought: debt.notes,
        category: DEBT_TYPE_LABELS[debt.debtType],
        frequency: frequencyLabel(debt.frequency),
        dueDate: inst.dueDate,
        amount: inst.amount,
        amountPaid: inst.amountPaid,
        remaining: inst.remaining,
        status: inst.status,
        paidDate: inst.paidDate,
        debtId: debt.id,
        instalmentId: inst.id,
        instalmentNo: idx + 1,
        instalmentCount: debt.instalments.length,
      });
    });
  }

  for (const bill of bills) {
    const paid = bill.status === "paid";
    const overdue = !paid && (bill.status === "overdue" || bill.dueDate < today);
    items.push({
      key: `bill:${bill.id}`,
      kind: "bill",
      mode: bill.mode,
      payee: bill.name,
      category: bill.category,
      frequency: bill.recurring ? "Monthly" : "One-time",
      dueDate: bill.dueDate,
      amount: bill.amount,
      amountPaid: paid ? bill.amount : 0,
      remaining: paid ? 0 : bill.amount,
      status: paid ? "paid" : overdue ? "overdue" : "upcoming",
      commitmentId: bill.id,
    });
  }

  return items.sort((a, b) => {
    const au = isUnpaid(a), bu = isUnpaid(b);
    if (au !== bu) return au ? -1 : 1;
    const byDate = au ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate);
    return byDate || a.payee.localeCompare(b.payee);
  });
}

function frequencyLabel(f: DebtFrequency): string {
  return f === "irregular" ? "Irregular" : FREQUENCY_LABELS[f];
}

/**
 * Filters by period. Period filters (today, next 7 days, this month) only
 * return unpaid items; "next 7 days" is today through today + 7.
 */
export function filterPayments(items: PaymentItem[], filter: PaymentFilter, today: string): PaymentItem[] {
  switch (filter) {
    case "all":
      return items;
    case "today":
      return items.filter((i) => isUnpaid(i) && i.dueDate === today);
    case "next7": {
      const until = addDays(today, 7);
      return items.filter((i) => isUnpaid(i) && i.dueDate >= today && i.dueDate <= until);
    }
    case "month":
      return items.filter((i) => isUnpaid(i) && i.dueDate.slice(0, 7) === today.slice(0, 7));
    case "overdue":
      return items.filter((i) => i.status === "overdue");
    case "paid":
      return items.filter((i) => i.status === "paid");
  }
}

/**
 * Everything still to pay (debt instalments and bills) due on or before
 * today + `days`. Overdue items are included: they still have to be paid.
 */
export function dueWithin(items: PaymentItem[], days: number, today: string): PaymentItem[] {
  const until = addDays(today, days);
  return items.filter((i) => isUnpaid(i) && i.dueDate <= until);
}

/** "SPayLater – phone" → "SPayLater", so plans with the same provider share one group. */
export function creditorOf(name: string): string {
  return name.split(/\s+[–—-]\s+/)[0].trim() || name;
}

export interface CreditorGroup {
  creditor: string;
  items: PaymentItem[]; // nearest due date first
  total: number; // still to pay across the items
  overdue: number; // part of total that is overdue
  nextDue: string; // earliest due date in the group
  interestRate?: number; // highest known rate across the group's debts
}

/**
 * One group per creditor, in the order to pay them: anything overdue first,
 * then the earliest due date, then the highest known interest rate, then the
 * larger amount. Unknown rates never outrank known ones.
 */
export function groupByCreditor(items: PaymentItem[], debts: Debt[]): CreditorGroup[] {
  const rate = new Map(debts.map((d) => [d.id, d.interestRate]));
  const groups = new Map<string, PaymentItem[]>();
  for (const i of items.filter(isUnpaid)) {
    const k = creditorOf(i.payee);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return [...groups]
    .map(([creditor, list]) => {
      const sorted = [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.payee.localeCompare(b.payee));
      const rates = sorted.map((i) => (i.debtId ? rate.get(i.debtId) : undefined)).filter((r): r is number => r != null);
      return {
        creditor,
        items: sorted,
        total: totalDue(sorted),
        overdue: totalDue(sorted.filter((i) => i.status === "overdue")),
        nextDue: sorted[0].dueDate,
        interestRate: rates.length ? Math.max(...rates) : undefined,
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue > 0) - Number(a.overdue > 0) ||
        a.nextDue.localeCompare(b.nextDue) ||
        (b.interestRate ?? -1) - (a.interestRate ?? -1) ||
        b.total - a.total ||
        a.creditor.localeCompare(b.creditor)
    );
}

/** Amount still to pay. Paid and cancelled items count as 0; partly paid ones count only what is left. */
export const totalDue = (items: PaymentItem[]) => sumCents(items, (i) => i.remaining);

/** Amount already paid on the given items (for the "Paid" view). */
export const totalPaid = (items: PaymentItem[]) => sumCents(items, (i) => i.amountPaid);

export interface DebtOverview {
  totalOutstanding: number; // still owed on active debts (not just what is due)
  activeDebts: number;
  dueThisMonth: number; // debt repayments with a due date this month, still unpaid
  dueNext7Days: number;
  overdue: number;
  nextPayment?: PaymentItem; // next unpaid debt repayment due today or later
  debtDueByMonthEnd: number; // unpaid debt repayments due by the end of this month, overdue included
  billsDueByMonthEnd: number; // unpaid bills due by the end of this month, overdue included
  balance: number;
  availableAfterCommitments: number; // balance − the two figures above
  monthEnd: string;
}

/**
 * Debt dashboard figures. Available cash only subtracts what is *due* by the
 * end of this month, never the whole outstanding debt, and does not add
 * expected income.
 */
export function debtOverview(debts: Debt[], payments: PaymentItem[], balance: number, today: string): DebtOverview {
  const debtItems = payments.filter((p) => p.kind === "debt");
  const monthEnd = endOfMonth(today);
  const dueByMonthEnd = (kind: PaymentItem["kind"]) =>
    totalDue(payments.filter((p) => p.kind === kind && isUnpaid(p) && p.dueDate <= monthEnd));

  const debtDueByMonthEnd = dueByMonthEnd("debt");
  const billsDueByMonthEnd = dueByMonthEnd("bill");
  const active = debts.filter((d) => d.status === "active");

  return {
    totalOutstanding: active.reduce((s, d) => s + cents(d.outstandingBalance), 0) / 100,
    activeDebts: active.length,
    dueThisMonth: totalDue(filterPayments(debtItems, "month", today)),
    dueNext7Days: totalDue(filterPayments(debtItems, "next7", today)),
    overdue: totalDue(filterPayments(debtItems, "overdue", today)),
    nextPayment: debtItems.find((p) => isUnpaid(p) && p.dueDate >= today),
    debtDueByMonthEnd,
    billsDueByMonthEnd,
    balance,
    availableAfterCommitments: (cents(balance) - cents(debtDueByMonthEnd) - cents(billsDueByMonthEnd)) / 100,
    monthEnd,
  };
}

export type DebtBreakdownKind = "outstanding" | "month" | "next7" | "overdue";

/**
 * One amount per creditor behind a dashboard total: what is still owed
 * ("outstanding") or what is due this month, in the next 7 days or overdue.
 * Debts with the same name are added together. Largest first; the amounts
 * add up to the matching `debtOverview` figure.
 */
export function debtBreakdown(
  debts: Debt[],
  payments: PaymentItem[],
  kind: DebtBreakdownKind,
  today: string
): { name: string; amount: number }[] {
  const rows: [string, number][] =
    kind === "outstanding"
      ? debts.filter((d) => d.status === "active").map((d) => [d.name, cents(d.outstandingBalance)])
      : filterPayments(
          payments.filter((p) => p.kind === "debt"),
          kind,
          today
        ).map((p) => [p.payee, cents(p.remaining)]);
  const byName = new Map<string, number>();
  for (const [name, c] of rows) byName.set(name, (byName.get(name) ?? 0) + c);
  return [...byName]
    .filter(([, c]) => c > 0)
    .map(([name, c]) => ({ name, amount: c / 100 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export interface ExtraPaymentScenario {
  extra: number;
  outstandingAfter: number;
  instalmentsBefore: number;
  instalmentsAfter: number;
  payoffBefore?: string; // last due date today
  payoffAfter?: string; // last due date after paying extra now
  /** Only when the debt's interest rate is known: simple interest on each ringgit paid early, until its original due date. */
  interestSavedEstimate?: number;
}

/**
 * What paying `extra` now would do, assuming it clears the last instalments
 * first (the term gets shorter; the next payments stay the same).
 * Never invents savings: no interest rate, no interest figure.
 */
export function extraPaymentScenario(debt: Debt, extra: number, today: string): ExtraPaymentScenario {
  const unpaid = debt.instalments.filter((i) => i.remaining > 0);
  let left = Math.min(cents(extra), cents(debt.outstandingBalance));
  const rate = debt.interestRate;
  let interest = 0;
  let after = unpaid.length;
  for (let k = unpaid.length - 1; k >= 0 && left > 0; k--) {
    const covered = Math.min(left, cents(unpaid[k].remaining));
    if (rate !== undefined) interest += (covered * rate * Math.max(0, daysBetween(today, unpaid[k].dueDate))) / 100 / 365;
    left -= covered;
    if (covered === cents(unpaid[k].remaining)) after = k;
  }
  const applied = Math.min(cents(extra), cents(debt.outstandingBalance));
  return {
    extra: applied / 100,
    outstandingAfter: (cents(debt.outstandingBalance) - applied) / 100,
    instalmentsBefore: unpaid.length,
    instalmentsAfter: after,
    payoffBefore: unpaid.at(-1)?.dueDate,
    payoffAfter: after > 0 ? unpaid[after - 1].dueDate : undefined,
    interestSavedEstimate: rate === undefined ? undefined : Math.round(interest) / 100,
  };
}

/** One sentence on how an extra payment changes the schedule. */
export function payoffSummary(s: ExtraPaymentScenario, fmt: (date: string) => string): string {
  if (s.outstandingAfter === 0) return "That pays it off completely, with nothing left to schedule.";
  const n = s.instalmentsBefore - s.instalmentsAfter;
  if (n === 0) return `Not enough to clear a whole instalment; the last one (${fmt(s.payoffBefore!)}) gets smaller.`;
  return `Finish ${n} instalment${n === 1 ? "" : "s"} sooner: last payment ${fmt(s.payoffAfter!)} instead of ${fmt(s.payoffBefore!)}.`;
}

/**
 * Balance after each recorded payment, oldest first. It starts from the
 * balance before the first recorded payment (today's balance + principal
 * repaid), so repayments made before the app tracked them aren't invented.
 * Empty when no payment has been recorded.
 */
export function balanceHistory(debt: Debt): { date: string; balance: number }[] {
  if (!debt.payments.length) return [];
  let bal = cents(debt.outstandingBalance) + debt.payments.reduce((s, p) => s + cents(p.principal), 0);
  const first = debt.payments[0].date;
  const points = [{ date: debt.startDate && debt.startDate < first ? debt.startDate : first, balance: bal / 100 }];
  for (const p of debt.payments) {
    bal -= cents(p.principal);
    const last = points[points.length - 1];
    // Several payments on one day become one step.
    if (last.date === p.date && points.length > 1) last.balance = bal / 100;
    else points.push({ date: p.date, balance: bal / 100 });
  }
  return points;
}
