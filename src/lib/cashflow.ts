// ============================================================
// Cash vs expenses, without counting anything twice.
//
//   - A purchase on credit (cashEffect = false) is an expense, not cash.
//   - A "Debt Repayment" transaction is cash, not an expense
//     (the purchase it pays for was already counted).
//   - "Interest & Fees" is both cash and an expense.
//
// Pure functions. Dates are YYYY-MM-DD strings, money is summed in cents.
// ============================================================

import { IncomeScheduleItem, Transaction } from "./types";
import type { PaymentItem } from "./debt/payments";

export const DEBT_REPAYMENT = "Debt Repayment";

const cents = (n: number) => Math.round(n * 100);

/** Counts towards spending (budgets, "Spent", category charts). */
export const isSpending = (t: Transaction) => t.type === "expense" && t.category !== DEBT_REPAYMENT;

/** Moves the bank / cash balance. */
export const movesCash = (t: Transaction) => t.cashEffect;

/** Net cash effect of the transactions, in RM. */
export function netCash(transactions: Transaction[]): number {
  return transactions.filter(movesCash).reduce((s, t) => s + cents(t.amount) * (t.type === "income" ? 1 : -1), 0) / 100;
}

export interface CashFlow {
  monthStart: string;
  monthEnd: string;
  // This month, from the ledger:
  openingCash: number; // cash on the 1st
  incomeReceived: number;
  cashExpensesPaid: number; // spending paid in cash (interest and fees included)
  debtRepaymentsPaid: number;
  availableCash: number; // opening + income − cash expenses − repayments (= today's balance)
  spentOnCredit: number; // this month's purchases on credit (an expense, not yet cash)
  // From today to the end of the month:
  expectedIncomeConfirmed: number;
  expectedIncomeUnconfirmed: number;
  billsDue: number; // unpaid, due by month end, overdue included
  debtRepaymentsDue: number; // unpaid instalments due by month end, overdue included
  projectedCash: number; // available + confirmed income − bills − repayments due
  projectedWithUnconfirmed: number;
}

/**
 * This month's cash flow and the projection to the end of the month.
 * `balance` is today's balance; the opening cash is worked back from it so the
 * pieces always add up to the balance the rest of the app shows.
 */
export function cashFlow(opts: {
  transactions: Transaction[];
  balance: number;
  payments: PaymentItem[];
  incomeSchedule: IncomeScheduleItem[];
  today: string;
}): CashFlow {
  const { transactions, balance, payments, incomeSchedule, today } = opts;
  const monthStart = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const thisMonth = transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);
  const sum = (f: (t: Transaction) => boolean) => thisMonth.filter(f).reduce((s, t) => s + cents(t.amount), 0);

  const income = sum((t) => t.cashEffect && t.type === "income");
  const cashExpenses = sum((t) => t.cashEffect && isSpending(t));
  const repayments = sum((t) => t.cashEffect && t.type === "expense" && t.category === DEBT_REPAYMENT);
  const credit = sum((t) => !t.cashEffect && isSpending(t));
  const available = cents(balance);
  const opening = available - income + cashExpenses + repayments;

  const upcomingIncome = incomeSchedule.filter((i) => i.expectedDate >= today && i.expectedDate <= monthEnd);
  const confirmed = upcomingIncome.filter((i) => i.confirmed).reduce((s, i) => s + cents(i.expectedAmount), 0);
  const unconfirmed = upcomingIncome.filter((i) => !i.confirmed).reduce((s, i) => s + cents(i.expectedAmount), 0);

  const due = (kind: PaymentItem["kind"]) =>
    payments.filter((p) => p.kind === kind && p.remaining > 0 && p.dueDate <= monthEnd).reduce((s, p) => s + cents(p.remaining), 0);
  const bills = due("bill");
  const debt = due("debt");
  const projected = available + confirmed - bills - debt;

  return {
    monthStart,
    monthEnd,
    openingCash: opening / 100,
    incomeReceived: income / 100,
    cashExpensesPaid: cashExpenses / 100,
    debtRepaymentsPaid: repayments / 100,
    availableCash: available / 100,
    spentOnCredit: credit / 100,
    expectedIncomeConfirmed: confirmed / 100,
    expectedIncomeUnconfirmed: unconfirmed / 100,
    billsDue: bills / 100,
    debtRepaymentsDue: debt / 100,
    projectedCash: projected / 100,
    projectedWithUnconfirmed: (projected + unconfirmed) / 100,
  };
}
