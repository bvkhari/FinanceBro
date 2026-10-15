import { describe, expect, it } from "vitest";
import type { Debt, DebtInstalment } from "./types";
import { debtSchedule, monthLabel } from "./reports";

const TODAY = "2026-10-10";

describe("monthLabel", () => {
  it("names the month", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

function inst(id: string, dueDate: string, amount: number, amountPaid = 0): DebtInstalment {
  const remaining = amount - amountPaid;
  return { id, debtId: "", dueDate, amount, amountPaid, remaining, status: remaining === 0 ? "paid" : dueDate < TODAY ? "overdue" : "upcoming" };
}

function debt(name: string, instalments: DebtInstalment[], extra: Partial<Debt> = {}): Debt {
  const outstanding = instalments.reduce((s, i) => s + i.remaining, 0);
  return {
    id: name, profileId: "p", mode: "individual", name, debtType: "bnpl", originalAmount: outstanding, outstandingBalance: outstanding,
    frequency: "monthly", status: "active", isSample: false, createdAt: "", instalments, unscheduledBalance: 0, payments: [], ...extra,
  };
}

describe("debtSchedule", () => {
  it("lists unpaid instalments month by month and each debt's terms", () => {
    const r = debtSchedule(
      [
        debt("Shopee PayLater", [inst("a", "2026-09-15", 100, 100), inst("b", "2026-10-15", 100), inst("c", "2026-11-15", 100)], { repaymentAmount: 100 }),
        debt("Grab PayLater", [inst("d", "2026-10-05", 30), inst("e", "2026-11-05", 30)], { interestRate: 18 }),
        debt("Old loan", [inst("f", "2026-01-01", 50, 50)], { status: "paid_off" }),
      ],
      TODAY
    );
    expect(r.totalOutstanding).toBe(260);
    expect(r.debts.map((d) => [d.name, d.nextDue, d.finalDue, d.instalmentsLeft])).toEqual([
      ["Grab PayLater", "2026-10-05", "2026-11-05", 2],
      ["Shopee PayLater", "2026-10-15", "2026-11-15", 2],
    ]);
    expect(r.months.map((m) => [m.month, m.total, m.rows.length])).toEqual([
      ["2026-10", 130, 2],
      ["2026-11", 130, 2],
    ]);
    expect(r.months[0].rows[0]).toMatchObject({ debt: "Grab PayLater", overdue: true });
  });
});
