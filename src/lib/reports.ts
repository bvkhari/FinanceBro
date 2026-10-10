// ============================================================
// Reports: monthly summary, spending by category, debt schedule.
// Pure functions over the same records the rest of the app uses.
// Months are "YYYY-MM"; money is summed in cents.
// ============================================================

import type { Debt, FinancialCommitment, Transaction } from "./types";
import { DEBT_REPAYMENT, isSpending, netCash } from "./cashflow";
import { DEBT_TYPE_LABELS, FREQUENCY_LABELS } from "./debt/labels";

export const INTEREST_FEES = "Interest & Fees";

const cents = (n: number) => Math.round(n * 100);
const sum = (ts: { amount: number }[]) => ts.reduce((s, t) => s + cents(t.amount), 0) / 100;
const inMonth = (date: string, month: string) => date.slice(0, 7) === month;

/** "2026-10" → "2026-09". */
export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Months that have transactions, plus the current one; newest first. */
export function reportMonths(transactions: Transaction[], today: string): string[] {
  const set = new Set(transactions.map((t) => t.date.slice(0, 7)));
  set.add(today.slice(0, 7));
  return [...set].sort().reverse();
}

export interface CategoryRow {
  category: string;
  amount: number;
  count: number;
  share: number; // % of the month's spending, whole number
  previous: number; // same category, the month before
}

/**
 * Spending per category for one month, largest first, with last month's
 * figure beside it. Debt repayments are left out (the purchase was already
 * counted); purchases on credit and interest are in.
 */
export function spendingByCategory(transactions: Transaction[], month: string): CategoryRow[] {
  const spend = transactions.filter(isSpending);
  const now = spend.filter((t) => inMonth(t.date, month));
  const before = spend.filter((t) => inMonth(t.date, prevMonth(month)));
  const total = cents(sum(now));
  const cats = new Set([...now, ...before].map((t) => t.category));
  return [...cats]
    .map((category) => {
      const mine = now.filter((t) => t.category === category);
      const amount = sum(mine);
      return {
        category,
        amount,
        count: mine.length,
        share: total > 0 ? Math.round((cents(amount) / total) * 100) : 0,
        previous: sum(before.filter((t) => t.category === category)),
      };
    })
    .filter((r) => r.amount > 0 || r.previous > 0)
    .sort((a, b) => b.amount - a.amount || b.previous - a.previous || a.category.localeCompare(b.category));
}

export interface MonthlySummary {
  month: string;
  openingCash: number; // cash on the 1st
  income: number;
  cashSpending: number; // spending that left the account (interest and fees included)
  debtRepayments: number; // principal repaid: cash out, not spending
  closingCash: number; // opening + income − cash spending − repayments
  spending: number; // all spending, purchases on credit included
  spentOnCredit: number;
  interestFees: number;
  net: number; // income − spending
  savingsRate?: number; // net ÷ income, %, only when there was income
  previousSpending: number;
  transactionCount: number;
  categories: CategoryRow[];
  biggest: Transaction[]; // five largest spending items
  billsDue: number;
  billsPaid: number;
}

/**
 * One month in numbers. `balance` is today's balance; cash at the start and
 * end of the month is worked back from it, so the statement always adds up
 * to the balance the rest of the app shows.
 */
export function monthlySummary(
  transactions: Transaction[],
  balance: number,
  bills: FinancialCommitment[],
  month: string
): MonthlySummary {
  const these = transactions.filter((t) => inMonth(t.date, month));
  const after = transactions.filter((t) => t.date.slice(0, 7) > month);
  const closingCash = (cents(balance) - cents(netCash(after))) / 100;
  const openingCash = (cents(closingCash) - cents(netCash(these))) / 100;

  const spend = these.filter(isSpending);
  const income = sum(these.filter((t) => t.type === "income" && t.cashEffect));
  const spending = sum(spend);
  const net = (cents(income) - cents(spending)) / 100;
  const monthBills = bills.filter((b) => inMonth(b.dueDate, month));

  return {
    month,
    openingCash,
    income,
    cashSpending: sum(spend.filter((t) => t.cashEffect)),
    debtRepayments: sum(these.filter((t) => t.category === DEBT_REPAYMENT && t.cashEffect)),
    closingCash,
    spending,
    spentOnCredit: sum(spend.filter((t) => !t.cashEffect)),
    interestFees: sum(spend.filter((t) => t.category === INTEREST_FEES)),
    net,
    savingsRate: income > 0 ? Math.round((cents(net) / cents(income)) * 100) : undefined,
    previousSpending: sum(transactions.filter((t) => isSpending(t) && inMonth(t.date, prevMonth(month)))),
    transactionCount: these.length,
    categories: spendingByCategory(transactions, month),
    biggest: [...spend].sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date)).slice(0, 5),
    billsDue: sum(monthBills),
    billsPaid: sum(monthBills.filter((b) => b.status === "paid")),
  };
}

export interface DebtSummaryRow {
  name: string;
  type: string;
  outstanding: number;
  repayment?: number;
  frequency: string;
  interestRate?: number;
  nextDue?: string;
  finalDue?: string;
  instalmentsLeft: number;
}

export interface ScheduleMonth {
  month: string;
  total: number; // still to pay that month
  rows: { dueDate: string; debt: string; amount: number; paid: number; remaining: number; overdue: boolean }[];
}

export interface DebtScheduleReport {
  debts: DebtSummaryRow[];
  totalOutstanding: number;
  unscheduled: number; // owed but with no instalment covering it yet
  months: ScheduleMonth[]; // every unpaid instalment, by month; overdue ones sit in their original month
}

/** What is owed on each active debt, and every unpaid instalment month by month. */
export function debtSchedule(debts: Debt[], today: string): DebtScheduleReport {
  const active = debts.filter((d) => d.status === "active");
  const byMonth = new Map<string, ScheduleMonth["rows"]>();
  for (const d of active) {
    for (const i of d.instalments) {
      if (i.remaining <= 0) continue;
      const m = i.dueDate.slice(0, 7);
      byMonth.set(m, [
        ...(byMonth.get(m) ?? []),
        { dueDate: i.dueDate, debt: d.name, amount: i.amount, paid: i.amountPaid, remaining: i.remaining, overdue: i.dueDate < today },
      ]);
    }
  }
  return {
    debts: active
      .map((d) => {
        const unpaid = d.instalments.filter((i) => i.remaining > 0);
        return {
          name: d.name,
          type: DEBT_TYPE_LABELS[d.debtType],
          outstanding: d.outstandingBalance,
          repayment: d.repaymentAmount,
          frequency: d.frequency === "irregular" ? "Irregular" : FREQUENCY_LABELS[d.frequency],
          interestRate: d.interestRate,
          nextDue: unpaid[0]?.dueDate,
          finalDue: unpaid[unpaid.length - 1]?.dueDate,
          instalmentsLeft: unpaid.length,
        };
      })
      .sort((a, b) => (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999") || a.name.localeCompare(b.name)),
    totalOutstanding: sum(active.map((d) => ({ amount: d.outstandingBalance }))),
    unscheduled: sum(active.map((d) => ({ amount: d.unscheduledBalance }))),
    months: [...byMonth]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, rows]) => ({
        month,
        rows: rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.debt.localeCompare(b.debt)),
        total: sum(rows.map((r) => ({ amount: r.remaining }))),
      })),
  };
}
