// ============================================================
// Safe-to-spend, as defined in the core rules:
//
//   safe_to_spend = current_balance + confirmed_income_before(next_income_date)
//                 − unpaid_commitments_due_before(next_income_date)
//                 − remaining_essential_budget − safety_buffer
//   daily_allowance = safe_to_spend ÷ days_until(next_income_date)
//
// Pure function. Dates are YYYY-MM-DD strings, money is summed in cents.
// ============================================================

import { IncomeScheduleItem, Transaction } from "./types";
import type { PaymentItem } from "./debt/payments";
import { addDays, daysBetween, endOfMonth } from "./debt/payments";
import { isSpending } from "./cashflow";

const cents = (n: number) => Math.round(n * 100);

export interface SafeToSpend {
  today: string;
  nextIncomeDate: string;
  nextIncomeSource?: string; // undefined when no income is scheduled (the period runs to the end of the month)
  daysUntilNextIncome: number;
  balance: number;
  confirmedIncomeBefore: number;
  commitmentsDueBefore: number; // unpaid bills and debt instalments due before the next income, overdue included
  remainingEssentialBudget: number;
  monthlyIncome: number; // cash income received last calendar month
  safetyBufferPct: number;
  safetyBuffer: number;
  safeToSpend: number;
  dailyAllowance: number;
}

export function safeToSpend(opts: {
  balance: number;
  transactions: Transaction[];
  payments: PaymentItem[];
  incomeSchedule: IncomeScheduleItem[];
  essentialBudgets: { category: string; limit: number }[]; // this month's essential lines
  safetyBufferPct: number;
  today: string;
}): SafeToSpend {
  const { balance, transactions, payments, incomeSchedule, essentialBudgets, safetyBufferPct, today } = opts;

  const next = incomeSchedule.filter((i) => i.expectedDate > today).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];
  const nextIncomeDate = next?.expectedDate ?? addDays(endOfMonth(today), 1);

  const confirmedIncome = incomeSchedule
    .filter((i) => i.confirmed && i.expectedDate >= today && i.expectedDate < nextIncomeDate)
    .reduce((s, i) => s + cents(i.expectedAmount), 0);

  const commitments = payments
    .filter((p) => p.remaining > 0 && p.dueDate < nextIncomeDate)
    .reduce((s, p) => s + cents(p.remaining), 0);

  const monthStart = `${today.slice(0, 7)}-01`;
  const spentThisMonth = (category: string) =>
    transactions
      .filter((t) => isSpending(t) && t.category === category && t.date >= monthStart && t.date <= today)
      .reduce((s, t) => s + cents(t.amount), 0);
  const essential = essentialBudgets.reduce((s, b) => s + Math.max(0, cents(b.limit) - spentThisMonth(b.category)), 0);

  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const monthlyIncome = transactions
    .filter((t) => t.type === "income" && t.cashEffect && t.date >= lastMonthStart && t.date < monthStart)
    .reduce((s, t) => s + cents(t.amount), 0);
  const buffer = Math.round((monthlyIncome * safetyBufferPct) / 100);

  const safe = cents(balance) + confirmedIncome - commitments - essential - buffer;
  const days = Math.max(1, daysBetween(today, nextIncomeDate));

  return {
    today,
    nextIncomeDate,
    nextIncomeSource: next?.source,
    daysUntilNextIncome: days,
    balance,
    confirmedIncomeBefore: confirmedIncome / 100,
    commitmentsDueBefore: commitments / 100,
    remainingEssentialBudget: essential / 100,
    monthlyIncome: monthlyIncome / 100,
    safetyBufferPct,
    safetyBuffer: buffer / 100,
    safeToSpend: safe / 100,
    dailyAllowance: Math.trunc(safe / days) / 100,
  };
}
