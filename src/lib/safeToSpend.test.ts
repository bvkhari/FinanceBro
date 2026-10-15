import { describe, expect, it } from "vitest";
import type { IncomeScheduleItem, Transaction } from "./types";
import type { PaymentItem } from "./debt/payments";
import { safeToSpend } from "./safeToSpend";

const TODAY = "2026-10-10";

let n = 0;
function tx(date: string, type: Transaction["type"], amount: number, category: string, cashEffect = true): Transaction {
  return { id: `t${n++}`, mode: "individual", name: category, amount, type, category, date, cashEffect, createdAt: "" };
}

function due(dueDate: string, remaining: number, kind: PaymentItem["kind"] = "bill"): PaymentItem {
  return {
    key: `${kind}:${n++}`, kind, mode: "individual", payee: "X", category: "", frequency: "", dueDate,
    amount: remaining, amountPaid: 0, remaining, status: dueDate < TODAY ? "overdue" : "upcoming",
  };
}

function income(expectedDate: string, expectedAmount: number, confirmed: boolean): IncomeScheduleItem {
  return { id: `i${n++}`, source: "allowance", expectedAmount, expectedDate, confirmed };
}

const transactions = [
  tx("2026-09-01", "income", 1000, "Allowance"),
  tx("2026-09-15", "income", 200, "Part-time income"),
  tx("2026-09-20", "income", 999, "Allowance", false), // not cash: ignored for monthly income
  tx("2026-10-02", "expense", 120.4, "Food"),
];

const base = {
  balance: 900,
  transactions,
  safetyBufferPct: 10,
  today: TODAY,
};

describe("safeToSpend", () => {
  it("follows the formula up to the next income date", () => {
    const r = safeToSpend({
      ...base,
      incomeSchedule: [income("2026-10-25", 1000, true), income("2026-11-25", 1000, true)],
      payments: [
        due("2026-10-08", 30), // overdue: counts
        due("2026-10-20", 100.5, "debt"),
        due("2026-10-25", 500), // due on the income date: after it, not before
        { ...due("2026-10-12", 70), remaining: 0, status: "paid" }, // paid: ignored
      ],
    });
    expect(r.nextIncomeDate).toBe("2026-10-25");
    expect(r.daysUntilNextIncome).toBe(15);
    expect(r.confirmedIncomeBefore).toBe(0);
    expect(r.commitmentsDueBefore).toBe(130.5);
    expect(r.monthlyIncome).toBe(1200);
    expect(r.safetyBuffer).toBe(120);
    // 900 − 130.50 − 120
    expect(r.safeToSpend).toBe(649.5);
    expect(r.dailyAllowance).toBe(43.3);
  });

  it("counts confirmed income due today but not unconfirmed income", () => {
    const r = safeToSpend({
      ...base,
      incomeSchedule: [income(TODAY, 50, true), income(TODAY, 80, false), income("2026-10-20", 1000, false)],
      payments: [],
    });
    expect(r.nextIncomeDate).toBe("2026-10-20");
    expect(r.confirmedIncomeBefore).toBe(50);
    expect(r.safeToSpend).toBe(830); // 900 + 50 − 120 buffer
  });

  it("runs to the end of the month when no income is scheduled, and can go negative", () => {
    const r = safeToSpend({ ...base, balance: 100, incomeSchedule: [], payments: [due("2026-10-30", 250)] });
    expect(r.nextIncomeDate).toBe("2026-11-01");
    expect(r.nextIncomeSource).toBeUndefined();
    expect(r.daysUntilNextIncome).toBe(22);
    expect(r.safeToSpend).toBe(-270);
    expect(r.dailyAllowance).toBe(-12.27);
  });
});
