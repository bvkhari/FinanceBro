// ============================================================
// Debt repayment schedules — pure functions, no I/O.
// All money maths is done in integer cents. Dates are ISO
// "YYYY-MM-DD" strings handled in UTC so time zones never
// shift a due date.
// This file is also imported by scripts/seed.mjs (Node strips
// the types), so keep it free of imports and TS-only runtime
// syntax such as enums.
// ============================================================

export type Frequency = "one_time" | "weekly" | "biweekly" | "monthly" | "yearly" | "irregular";
export type RegularFrequency = Exclude<Frequency, "one_time" | "irregular">;

export interface ScheduledInstalment {
  due_date: string;
  amount: number;
}

/** Upper bound on generated instalments (30 years of monthly payments). */
export const MAX_INSTALMENTS = 360;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const toCents = (rm: number): number => Math.round(rm * 100);
export const fromCents = (cents: number): number => cents / 100;

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

function assertDate(date: string, label: string) {
  if (!isValidDate(date)) throw new Error(`${label} must be a valid YYYY-MM-DD date (got "${date}")`);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Due date of the instalment `index` periods after `first`.
 * Monthly and yearly dates keep the first date's day of month, clamped to
 * the month's length (31 Jan → 28/29 Feb → 31 Mar).
 */
export function nthDueDate(first: string, frequency: RegularFrequency, index: number): string {
  const [y, m, d] = first.split("-").map(Number);
  if (frequency === "weekly" || frequency === "biweekly") {
    const step = frequency === "weekly" ? 7 : 14;
    return new Date(Date.UTC(y, m - 1, d + step * index)).toISOString().slice(0, 10);
  }
  const months = frequency === "monthly" ? index : index * 12;
  const year = y + Math.floor((m - 1 + months) / 12);
  const monthIndex = (m - 1 + months) % 12;
  const day = Math.min(d, daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/**
 * Splits `amount` into a schedule. Every instalment is `instalmentAmount`
 * except the last, which takes whatever is left (RM250 at RM100 → 100, 100, 50).
 * A one-time debt is a single instalment of the full amount.
 */
export function generateSchedule(opts: {
  amount: number;
  frequency: Exclude<Frequency, "irregular">;
  firstDueDate: string;
  instalmentAmount?: number;
}): ScheduledInstalment[] {
  const total = toCents(opts.amount);
  if (total <= 0) throw new Error("Amount to schedule must be more than RM0");
  assertDate(opts.firstDueDate, "First due date");

  if (opts.frequency === "one_time") {
    return [{ due_date: opts.firstDueDate, amount: fromCents(total) }];
  }

  const each = toCents(opts.instalmentAmount ?? 0);
  if (each <= 0) throw new Error("Repayment amount must be more than RM0");
  const count = Math.ceil(total / each);
  if (count > MAX_INSTALMENTS) {
    throw new Error(`That would need ${count} instalments; the limit is ${MAX_INSTALMENTS}. Increase the repayment amount.`);
  }

  return Array.from({ length: count }, (_, i) => ({
    due_date: nthDueDate(opts.firstDueDate, opts.frequency as RegularFrequency, i),
    amount: fromCents(i === count - 1 ? total - each * (count - 1) : each),
  }));
}

/**
 * Validates a user-entered irregular schedule: real dates, positive amounts,
 * no two instalments on the same date. Returns it sorted by due date.
 */
export function normaliseIrregularSchedule(rows: ScheduledInstalment[]): ScheduledInstalment[] {
  if (rows.length === 0) throw new Error("Add at least one instalment");
  const seen = new Set<string>();
  const out = rows.map((r, i) => {
    assertDate(r.due_date, `Instalment ${i + 1} due date`);
    if (seen.has(r.due_date)) throw new Error(`Two instalments are due on ${r.due_date}; combine them into one`);
    seen.add(r.due_date);
    const cents = toCents(r.amount);
    if (!(cents > 0)) throw new Error(`Instalment ${i + 1} amount must be more than RM0`);
    return { due_date: r.due_date, amount: fromCents(cents) };
  });
  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export interface ExistingInstalment {
  due_date: string;
  amount: number;
  amount_paid: number;
  status: "scheduled" | "partial" | "paid" | "cancelled";
}

/**
 * Extends a regular schedule so the unpaid instalments cover the whole
 * outstanding balance. Existing instalments (paid or not) are never changed
 * or repeated: new ones start one period after the last existing due date.
 * Returns only the instalments to add (empty when already covered).
 */
export function planScheduleExtension(opts: {
  outstanding: number;
  frequency: RegularFrequency;
  instalmentAmount: number;
  existing: ExistingInstalment[];
  firstDueDate?: string; // used when there are no instalments yet
}): ScheduledInstalment[] {
  const stillScheduled = opts.existing
    .filter((i) => i.status === "scheduled" || i.status === "partial")
    .reduce((sum, i) => sum + toCents(i.amount) - toCents(i.amount_paid), 0);
  const uncovered = toCents(opts.outstanding) - stillScheduled;
  if (uncovered <= 0) return [];

  const dates = opts.existing.map((i) => i.due_date).sort();
  const anchor = dates[0] ?? opts.firstDueDate;
  if (!anchor) throw new Error("First due date is required when the debt has no instalments yet");

  // Step from the earliest due date (not the last one) so a clamped
  // 28 Feb doesn't pull every later month back to the 28th.
  let index = 0;
  if (dates.length) {
    const last = dates[dates.length - 1];
    while (nthDueDate(anchor, opts.frequency, index) <= last) index++;
  }

  const each = toCents(opts.instalmentAmount);
  if (each <= 0) throw new Error("Repayment amount must be more than RM0");
  const count = Math.ceil(uncovered / each);
  if (count > MAX_INSTALMENTS) {
    throw new Error(`That would need ${count} instalments; the limit is ${MAX_INSTALMENTS}. Increase the repayment amount.`);
  }
  return Array.from({ length: count }, (_, i) => ({
    due_date: nthDueDate(anchor, opts.frequency, index + i),
    amount: fromCents(i === count - 1 ? uncovered - each * (count - 1) : each),
  }));
}
