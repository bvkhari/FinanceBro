import { describe, expect, it } from "vitest";
import {
  generateSchedule,
  normaliseIrregularSchedule,
  nthDueDate,
  planScheduleExtension,
  type ExistingInstalment,
} from "./schedule";

describe("generateSchedule", () => {
  it("splits the spec example: RM300 at RM100 monthly from October", () => {
    expect(generateSchedule({ amount: 300, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-10-15" })).toEqual([
      { due_date: "2026-10-15", amount: 100 },
      { due_date: "2026-11-15", amount: 100 },
      { due_date: "2026-12-15", amount: 100 },
    ]);
  });

  it("puts the remainder in the last instalment", () => {
    const s = generateSchedule({ amount: 250, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-10-01" });
    expect(s.map((i) => i.amount)).toEqual([100, 100, 50]);
  });

  it("keeps cents exact (no floating-point drift)", () => {
    const s = generateSchedule({ amount: 359.6, instalmentAmount: 89.9, frequency: "monthly", firstDueDate: "2026-10-12" });
    expect(s.map((i) => i.amount)).toEqual([89.9, 89.9, 89.9, 89.9]);
    const s2 = generateSchedule({ amount: 100, instalmentAmount: 33.33, frequency: "weekly", firstDueDate: "2026-10-01" });
    expect(s2.map((i) => i.amount)).toEqual([33.33, 33.33, 33.33, 0.01]);
    expect(s2.reduce((a, i) => a + Math.round(i.amount * 100), 0)).toBe(10000);
  });

  it("supports one-time, weekly, biweekly and yearly", () => {
    expect(generateSchedule({ amount: 1680, frequency: "one_time", firstDueDate: "2026-10-12" })).toEqual([
      { due_date: "2026-10-12", amount: 1680 },
    ]);
    expect(generateSchedule({ amount: 30, instalmentAmount: 10, frequency: "weekly", firstDueDate: "2026-12-24" }).map((i) => i.due_date)).toEqual([
      "2026-12-24", "2026-12-31", "2027-01-07",
    ]);
    expect(generateSchedule({ amount: 30, instalmentAmount: 10, frequency: "biweekly", firstDueDate: "2026-10-10" }).map((i) => i.due_date)).toEqual([
      "2026-10-10", "2026-10-24", "2026-11-07",
    ]);
    expect(generateSchedule({ amount: 200, instalmentAmount: 100, frequency: "yearly", firstDueDate: "2028-02-29" }).map((i) => i.due_date)).toEqual([
      "2028-02-29", "2029-02-28",
    ]);
  });

  it("clamps month-end dates and returns to the original day", () => {
    expect([0, 1, 2, 3].map((i) => nthDueDate("2027-01-31", "monthly", i))).toEqual([
      "2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30",
    ]);
  });

  it("rejects bad input instead of guessing", () => {
    expect(() => generateSchedule({ amount: 0, instalmentAmount: 10, frequency: "monthly", firstDueDate: "2026-10-01" })).toThrow();
    expect(() => generateSchedule({ amount: 100, frequency: "monthly", firstDueDate: "2026-10-01" })).toThrow(/Repayment amount/);
    expect(() => generateSchedule({ amount: 100, instalmentAmount: 10, frequency: "monthly", firstDueDate: "2026-02-30" })).toThrow(/valid/);
    expect(() => generateSchedule({ amount: 1_000_000, instalmentAmount: 1, frequency: "monthly", firstDueDate: "2026-10-01" })).toThrow(/limit/);
  });
});

describe("normaliseIrregularSchedule", () => {
  it("sorts by due date and keeps the user's amounts", () => {
    expect(normaliseIrregularSchedule([
      { due_date: "2026-11-25", amount: 120 },
      { due_date: "2026-10-25", amount: 80 },
    ])).toEqual([
      { due_date: "2026-10-25", amount: 80 },
      { due_date: "2026-11-25", amount: 120 },
    ]);
  });

  it("rejects duplicates, bad dates, zero amounts and empty schedules", () => {
    expect(() => normaliseIrregularSchedule([])).toThrow();
    expect(() => normaliseIrregularSchedule([{ due_date: "2026-10-25", amount: 1 }, { due_date: "2026-10-25", amount: 2 }])).toThrow(/combine/);
    expect(() => normaliseIrregularSchedule([{ due_date: "25/10/2026", amount: 1 }])).toThrow(/valid/);
    expect(() => normaliseIrregularSchedule([{ due_date: "2026-10-25", amount: 0 }])).toThrow(/more than/);
  });
});

describe("planScheduleExtension", () => {
  const inst = (due_date: string, amount: number, amount_paid: number, status: ExistingInstalment["status"]): ExistingInstalment => ({
    due_date, amount, amount_paid, status,
  });

  it("adds nothing when unpaid instalments already cover the balance", () => {
    const existing = [inst("2026-10-15", 100, 0, "scheduled"), inst("2026-11-15", 100, 0, "scheduled")];
    expect(planScheduleExtension({ outstanding: 200, frequency: "monthly", instalmentAmount: 100, existing })).toEqual([]);
  });

  it("never repeats or changes paid history", () => {
    // RM300 debt: October paid, then the balance grew to RM400 (e.g. new card spending)
    const existing = [
      inst("2026-10-15", 100, 100, "paid"),
      inst("2026-11-15", 100, 0, "scheduled"),
      inst("2026-12-15", 100, 0, "scheduled"),
    ];
    const added = planScheduleExtension({ outstanding: 400, frequency: "monthly", instalmentAmount: 100, existing });
    expect(added).toEqual([
      { due_date: "2027-01-15", amount: 100 },
      { due_date: "2027-02-15", amount: 100 },
    ]);
    const dates = new Set(existing.map((i) => i.due_date));
    expect(added.some((i) => dates.has(i.due_date))).toBe(false);
  });

  it("counts only the unpaid part of a partial instalment", () => {
    const existing = [inst("2026-10-15", 100, 40, "partial")];
    expect(planScheduleExtension({ outstanding: 160, frequency: "monthly", instalmentAmount: 100, existing })).toEqual([
      { due_date: "2026-11-15", amount: 100 },
    ]);
  });

  it("ignores cancelled instalments but still schedules after them", () => {
    const existing = [inst("2026-10-15", 100, 0, "cancelled")];
    expect(planScheduleExtension({ outstanding: 100, frequency: "monthly", instalmentAmount: 100, existing })).toEqual([
      { due_date: "2026-11-15", amount: 100 },
    ]);
  });

  it("does not drift after a clamped month-end date", () => {
    const existing = [inst("2027-01-31", 100, 100, "paid"), inst("2027-02-28", 100, 0, "scheduled")];
    expect(planScheduleExtension({ outstanding: 200, frequency: "monthly", instalmentAmount: 100, existing })).toEqual([
      { due_date: "2027-03-31", amount: 100 },
    ]);
  });

  it("needs a first due date when nothing is scheduled yet", () => {
    expect(() => planScheduleExtension({ outstanding: 100, frequency: "monthly", instalmentAmount: 50, existing: [] })).toThrow(/First due date/);
    expect(planScheduleExtension({ outstanding: 100, frequency: "monthly", instalmentAmount: 50, existing: [], firstDueDate: "2026-10-01" })).toHaveLength(2);
  });
});
