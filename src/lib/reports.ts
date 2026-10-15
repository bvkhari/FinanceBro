// ============================================================
// Reports: the PayLater schedule.
// Pure functions over the same records the rest of the app uses.
// Months are "YYYY-MM"; money is summed in cents.
// ============================================================

import type { Debt } from "./types";
import { DEBT_TYPE_LABELS, FREQUENCY_LABELS } from "./debt/labels";

const cents = (n: number) => Math.round(n * 100);
const sum = (ts: { amount: number }[]) => ts.reduce((s, t) => s + cents(t.amount), 0) / 100;

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface DebtSummaryRow {
  id: string;
  name: string;
  bought?: string;
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
  rows: { dueDate: string; debt: string; bought?: string; amount: number; paid: number; remaining: number; overdue: boolean }[];
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
        { dueDate: i.dueDate, debt: d.name, bought: d.notes, amount: i.amount, paid: i.amountPaid, remaining: i.remaining, overdue: i.dueDate < today },
      ]);
    }
  }
  return {
    debts: active
      .map((d) => {
        const unpaid = d.instalments.filter((i) => i.remaining > 0);
        return {
          id: d.id,
          name: d.name,
          bought: d.notes,
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
