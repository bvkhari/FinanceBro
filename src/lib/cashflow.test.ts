import { describe, expect, it } from "vitest";
import type { IncomeScheduleItem, Transaction } from "./types";
import type { PaymentItem } from "./debt/payments";
import { cashFlow, isSpending, netCash } from "./cashflow";

const TODAY = "2026-10-10";

let n = 0;
function tx(date: string, type: Transaction["type"], amount: number, category: string, cashEffect = true): Transaction {
  return { id: `t${n++}`, mode: "individual", name: category, amount, type, category, date, cashEffect, createdAt: "" };
}

function due(kind: PaymentItem["kind"], dueDate: string, remaining: number): PaymentItem {
  return {
    key: `${kind}:${n++}`, kind, mode: "individual", payee: "X", category: "", frequency: "", dueDate,
    amount: remaining, amountPaid: 0, remaining, status: dueDate < TODAY ? "overdue" : "upcoming",
  };
}

function income(expectedDate: string, expectedAmount: number, confirmed: boolean): IncomeScheduleItem {
  return { id: `i${n++}`, source: "allowance", expectedAmount, expectedDate, confirmed };
}

// A BNPL purchase of RM300 in September, first RM100 repaid in October.
const transactions = [
  tx("2026-09-15", "expense", 300, "Shopping", false), // bought on credit
  tx("2026-09-20", "income", 1000, "Allowance"),
  tx("2026-10-01", "income", 600, "Allowance"),
  tx("2026-10-03", "expense", 45.5, "Food"),
  tx("2026-10-05", "expense", 100, "Debt Repayment"), // repays the BNPL purchase
  tx("2026-10-05", "expense", 2.5, "Interest & Fees"),
  tx("2026-10-08", "expense", 80, "Shopping", false), // another purchase on credit, this month
  tx("2026-11-01", "expense", 999, "Food"), // next month: ignored for this month
];

describe("what counts as spending and as cash", () => {
  it("a repayment is cash but not spending; a credit purchase is spending but not cash", () => {
    expect(isSpending(tx(TODAY, "expense", 1, "Debt Repayment"))).toBe(false);
    expect(isSpending(tx(TODAY, "expense", 1, "Interest & Fees"))).toBe(true);
    expect(isSpending(tx(TODAY, "expense", 1, "Shopping", false))).toBe(true);
    expect(isSpending(tx(TODAY, "income", 1, "Allowance"))).toBe(false);
  });

  it("the RM300 purchase is counted once: as spending in September, as cash only when repaid", () => {
    const sept = transactions.filter((t) => t.date.startsWith("2026-09"));
    expect(sept.filter(isSpending).reduce((s, t) => s + t.amount, 0)).toBe(300);
    expect(netCash(sept)).toBe(1000); // the purchase didn't move cash
    const oct = transactions.filter((t) => t.date.startsWith("2026-10"));
    expect(oct.filter(isSpending).reduce((s, t) => s + t.amount, 0)).toBe(45.5 + 2.5 + 80); // repayment not counted again
    expect(netCash(oct)).toBe(600 - 45.5 - 100 - 2.5);
  });
});

describe("cashFlow", () => {
  const balance = 1000 + 600 - 45.5 - 100 - 2.5 - 999; // every cash transaction, including November's
  const payments = [
    due("bill", "2026-10-07", 199), // overdue: included
    due("bill", "2026-10-31", 48), // last day of month: included
    due("bill", "2026-11-01", 450), // next month: excluded
    due("debt", "2026-10-15", 100),
    { ...due("debt", "2026-10-20", 60), amount: 100, amountPaid: 40, status: "partial" as const }, // only RM60 left
    { ...due("debt", "2026-10-12", 0), status: "paid" as const }, // paid: excluded
  ];
  const schedule = [
    income("2026-10-15", 600, true),
    income("2026-10-26", 230, false),
    income("2026-10-09", 500, true), // already past: not expected any more
    income("2026-11-03", 2250, false), // after month end
  ];
  const f = cashFlow({ transactions, balance, payments, incomeSchedule: schedule, today: TODAY });

  it("splits this month's cash and adds back up to today's balance", () => {
    expect(f.monthStart).toBe("2026-10-01");
    expect(f.monthEnd).toBe("2026-10-31");
    expect(f.incomeReceived).toBe(600);
    expect(f.cashExpensesPaid).toBe(45.5 + 2.5); // credit purchase excluded, interest included
    expect(f.debtRepaymentsPaid).toBe(100);
    expect(f.spentOnCredit).toBe(80);
    expect(f.availableCash).toBe(balance);
    expect(f.openingCash + f.incomeReceived - f.cashExpensesPaid - f.debtRepaymentsPaid).toBeCloseTo(f.availableCash, 10);
  });

  it("projects to month end with only what is due, confirmed income separate from unconfirmed", () => {
    expect(f.billsDue).toBe(199 + 48);
    expect(f.debtRepaymentsDue).toBe(100 + 60);
    expect(f.expectedIncomeConfirmed).toBe(600);
    expect(f.expectedIncomeUnconfirmed).toBe(230);
    expect(f.projectedCash).toBe(balance + 600 - 247 - 160);
    expect(f.projectedWithUnconfirmed).toBe(balance + 600 + 230 - 247 - 160);
  });

  it("keeps cents exact", () => {
    const t = [tx("2026-10-02", "income", 0.1, "A"), tx("2026-10-02", "income", 0.2, "A")];
    expect(cashFlow({ transactions: t, balance: 0.3, payments: [], incomeSchedule: [], today: TODAY })).toMatchObject({
      incomeReceived: 0.3,
      openingCash: 0,
      projectedCash: 0.3,
    });
  });
});
