import { describe, expect, it } from "vitest";
import type { Debt, DebtInstalment, FinancialCommitment, Transaction } from "./types";
import { debtSchedule, monthLabel, monthlySummary, prevMonth, reportMonths, spendingByCategory } from "./reports";

const TODAY = "2026-10-10";

let n = 0;
function tx(date: string, type: Transaction["type"], amount: number, category: string, cashEffect = true): Transaction {
  return { id: `t${n++}`, mode: "individual", name: category, amount, type, category, date, cashEffect, createdAt: "" };
}

// September: RM1,000 in, RM300 bought on credit, RM200 food. October: the first BNPL repayment.
const transactions = [
  tx("2026-09-02", "income", 1000, "Allowance"),
  tx("2026-09-15", "expense", 300, "Shopping", false),
  tx("2026-09-18", "expense", 120, "Food"),
  tx("2026-09-25", "expense", 80, "Food"),
  tx("2026-10-01", "income", 600, "Allowance"),
  tx("2026-10-03", "expense", 45.5, "Food"),
  tx("2026-10-05", "expense", 100, "Debt Repayment"),
  tx("2026-10-05", "expense", 2.5, "Interest & Fees"),
  tx("2026-10-06", "expense", 60, "Transportation"),
];
// Cash today = 1000 − 120 − 80 + 600 − 45.5 − 100 − 2.5 − 60 = 1192 (the credit purchase never moved cash).
const BALANCE = 1192;

const bills: FinancialCommitment[] = [
  { id: "b1", mode: "individual", name: "Rent", amount: 450, dueDate: "2026-10-11", category: "Rent", status: "paid", recurring: true, createdAt: "" },
  { id: "b2", mode: "individual", name: "Phone", amount: 48, dueDate: "2026-10-13", category: "Utilities", status: "upcoming", recurring: true, createdAt: "" },
];

describe("months", () => {
  it("steps back across a year and names the month", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-10")).toBe("2026-09");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("lists months with data plus the current one, newest first", () => {
    expect(reportMonths(transactions, "2026-11-02")).toEqual(["2026-11", "2026-10", "2026-09"]);
  });
});

describe("spendingByCategory", () => {
  it("counts credit purchases and interest, never debt repayments, with last month beside it", () => {
    const rows = spendingByCategory(transactions, "2026-10");
    expect(rows.map((r) => [r.category, r.amount, r.previous])).toEqual([
      ["Transportation", 60, 0],
      ["Food", 45.5, 200],
      ["Interest & Fees", 2.5, 0],
      ["Shopping", 0, 300],
    ]);
    expect(rows.find((r) => r.category === "Debt Repayment")).toBeUndefined();
    expect(rows[0].share).toBe(56); // 60 / 108
  });
});

describe("monthlySummary", () => {
  it("adds up from opening cash to closing cash", () => {
    const s = monthlySummary(transactions, BALANCE, bills, "2026-10");
    expect(s.openingCash).toBe(800);
    expect(s.income).toBe(600);
    expect(s.cashSpending).toBe(108);
    expect(s.debtRepayments).toBe(100);
    expect(s.closingCash).toBe(1192);
    expect(s.openingCash + s.income - s.cashSpending - s.debtRepayments).toBe(s.closingCash);
    expect(s.spending).toBe(108);
    expect(s.interestFees).toBe(2.5);
    expect(s.net).toBe(492);
    expect(s.savingsRate).toBe(82);
    expect(s.previousSpending).toBe(500);
    expect(s.billsDue).toBe(498);
    expect(s.billsPaid).toBe(450);
  });

  it("works back the cash for an earlier month", () => {
    const s = monthlySummary(transactions, BALANCE, bills, "2026-09");
    expect(s.openingCash).toBe(0);
    expect(s.closingCash).toBe(800);
    expect(s.spending).toBe(500);
    expect(s.spentOnCredit).toBe(300);
    expect(s.biggest.map((t) => t.amount)).toEqual([300, 120, 80]);
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
