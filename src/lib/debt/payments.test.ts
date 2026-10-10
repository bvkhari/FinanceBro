import { describe, expect, it } from "vitest";
import type { Debt, DebtInstalment, FinancialCommitment } from "../types";
import {
  addDays,
  buildPayments,
  countdown,
  daysBetween,
  debtOverview,
  debtBreakdown,
  endOfMonth,
  filterPayments,
  totalDue,
  totalPaid,
  extraPaymentScenario,
  payoffSummary,
  balanceHistory,
  creditorOf,
  dueWithin,
  groupByCreditor,
} from "./payments";

const TODAY = "2026-10-10";

function inst(id: string, dueDate: string, amount: number, amountPaid = 0, status?: DebtInstalment["status"]): DebtInstalment {
  const remaining = status === "cancelled" ? 0 : (Math.round(amount * 100) - Math.round(amountPaid * 100)) / 100;
  return {
    id,
    debtId: "",
    dueDate,
    amount,
    amountPaid,
    remaining,
    status: status ?? (remaining === 0 ? "paid" : amountPaid > 0 ? "partial" : dueDate < TODAY ? "overdue" : "upcoming"),
    paidDate: amountPaid > 0 ? "2026-10-01" : undefined,
  };
}

function debt(id: string, name: string, outstanding: number, instalments: DebtInstalment[], extra: Partial<Debt> = {}): Debt {
  return {
    id,
    profileId: "p1",
    mode: "individual",
    name,
    debtType: "bnpl",
    originalAmount: outstanding,
    outstandingBalance: outstanding,
    frequency: "monthly",
    status: "active",
    isSample: false,
    createdAt: "",
    instalments: instalments.map((i) => ({ ...i, debtId: id })),
    nextInstalment: instalments.find((i) => i.remaining > 0),
    unscheduledBalance: 0,
    payments: [],
    ...extra,
  };
}

function bill(id: string, name: string, dueDate: string, amount: number, status: FinancialCommitment["status"] = "upcoming"): FinancialCommitment {
  return { id, mode: "individual", name, amount, dueDate, category: "Rent", status, recurring: true, createdAt: "" };
}

// Shopee PayLater: RM300 at RM100/month, October paid
const shopee = debt("d1", "Shopee PayLater", 200, [
  inst("s1", "2026-10-05", 100, 100),
  inst("s2", "2026-11-05", 100),
  inst("s3", "2026-12-05", 100),
]);
// Card: one instalment due today, partly paid (RM40 of RM150)
const card = debt("d2", "Credit card", 110, [inst("c1", "2026-10-10", 150, 40)], { debtType: "credit_card" });
// Family loan: overdue last week, plus one due in 7 days exactly, plus one in 8 days
const family = debt("d3", "Abang Hafiz", 230, [
  inst("f1", "2026-10-03", 80),
  inst("f2", "2026-10-17", 100),
  inst("f3", "2026-10-18", 50),
], { debtType: "family_friend", frequency: "irregular" });
// Paid off debt: its leftover instalment was cancelled
const done = debt("d4", "Grab PayLater", 0, [inst("g1", "2026-09-30", 64.2, 64.2), inst("g2", "2026-10-30", 64.2, 0, "cancelled")], {
  status: "paid_off",
});
const debts = [shopee, card, family, done];
const bills = [
  bill("b1", "Room rent", "2026-10-11", 450),
  bill("b2", "Unifi", "2026-10-07", 199, "overdue"),
  bill("b3", "CelcomDigi", "2026-11-13", 48),
  bill("b4", "Old phone bill", "2026-09-13", 48, "paid"),
];
const items = buildPayments(debts, bills, TODAY);
const keys = (list: { key: string }[]) => list.map((i) => i.key);

describe("date helpers", () => {
  it("counts whole days, across months and years", () => {
    expect(daysBetween("2026-10-10", "2026-10-10")).toBe(0);
    expect(daysBetween("2026-10-10", "2026-10-11")).toBe(1);
    expect(daysBetween("2026-10-10", "2026-10-03")).toBe(-7);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(endOfMonth("2026-10-10")).toBe("2026-10-31");
    expect(endOfMonth("2028-02-01")).toBe("2028-02-29");
  });

  it("writes the countdown from the saved due date", () => {
    expect(countdown("2026-10-10", TODAY, "upcoming")).toBe("Due today");
    expect(countdown("2026-10-11", TODAY, "upcoming")).toBe("Due tomorrow");
    expect(countdown("2026-10-12", TODAY, "upcoming")).toBe("Due in 2 days");
    expect(countdown("2026-10-09", TODAY, "overdue")).toBe("Overdue by 1 day");
    expect(countdown("2026-10-03", TODAY, "overdue")).toBe("Overdue by 7 days");
    expect(countdown("2026-10-03", TODAY, "paid")).toBe("Paid");
    expect(countdown("2026-10-30", TODAY, "cancelled")).toBe("Cancelled");
  });
});

describe("buildPayments", () => {
  it("lists every instalment and bill: unpaid by nearest date first, then history newest first", () => {
    expect(keys(items)).toEqual([
      "inst:f1", "bill:b2", // overdue
      "inst:c1", // today (partly paid)
      "bill:b1", "inst:f2", "inst:f3",
      "inst:s2", "bill:b3", "inst:s3",
      // paid / cancelled, most recent first
      "inst:g2", "inst:s1", "inst:g1", "bill:b4",
    ]);
  });

  it("carries payee, category, frequency and instalment number", () => {
    const s2 = items.find((i) => i.key === "inst:s2")!;
    expect(s2).toMatchObject({ payee: "Shopee PayLater", category: "Buy Now, Pay Later", frequency: "Monthly", instalmentNo: 2, instalmentCount: 3, remaining: 100 });
    expect(items.find((i) => i.key === "inst:f1")!.frequency).toBe("Irregular");
    expect(items.find((i) => i.key === "bill:b2")).toMatchObject({ kind: "bill", status: "overdue", remaining: 199 });
  });

  it("treats a bill past its due date as overdue even if not flagged", () => {
    const [late] = buildPayments([], [bill("x", "Water", "2026-10-01", 30)], TODAY);
    expect(late.status).toBe("overdue");
  });
});

describe("filterPayments and totals", () => {
  it("due today: only unpaid items due today, partly paid counts what is left", () => {
    const today = filterPayments(items, "today", TODAY);
    expect(keys(today)).toEqual(["inst:c1"]);
    expect(totalDue(today)).toBe(110);
  });

  it("next 7 days: today through today + 7, no overdue, no paid", () => {
    const next7 = filterPayments(items, "next7", TODAY);
    expect(keys(next7)).toEqual(["inst:c1", "bill:b1", "inst:f2"]);
    expect(totalDue(next7)).toBe(110 + 450 + 100);
  });

  it("this month: unpaid items due this month, including ones already overdue this month", () => {
    const month = filterPayments(items, "month", TODAY);
    expect(keys(month)).toEqual(["inst:f1", "bill:b2", "inst:c1", "bill:b1", "inst:f2", "inst:f3"]);
    expect(totalDue(month)).toBe(80 + 199 + 110 + 450 + 100 + 50);
  });

  it("overdue and paid", () => {
    expect(keys(filterPayments(items, "overdue", TODAY))).toEqual(["inst:f1", "bill:b2"]);
    const paid = filterPayments(items, "paid", TODAY);
    expect(keys(paid)).toEqual(["inst:s1", "inst:g1", "bill:b4"]);
    expect(totalDue(paid)).toBe(0);
    expect(totalPaid(paid)).toBe(212.2);
  });

  it("all: totals exclude paid and cancelled items", () => {
    expect(totalDue(filterPayments(items, "all", TODAY))).toBe(80 + 199 + 110 + 450 + 100 + 50 + 100 + 48 + 100);
  });

  it("sums cents exactly", () => {
    const tiny = buildPayments([debt("t", "T", 0.3, [inst("t1", "2026-10-11", 0.1), inst("t2", "2026-10-12", 0.2)])], [], TODAY);
    expect(totalDue(tiny)).toBe(0.3);
  });
});

describe("debtOverview", () => {
  const o = debtOverview(debts, items, 1000, TODAY);

  it("separates what is owed from what is due", () => {
    expect(o.totalOutstanding).toBe(200 + 110 + 230); // paid-off debt excluded
    expect(o.activeDebts).toBe(3);
    expect(o.dueThisMonth).toBe(80 + 110 + 100 + 50);
    expect(o.dueNext7Days).toBe(110 + 100);
    expect(o.overdue).toBe(80);
  });

  it("picks the next debt repayment due today or later", () => {
    expect(o.nextPayment?.key).toBe("inst:c1");
  });

  it("available cash subtracts only what is due by month end, not the whole debt", () => {
    expect(o.monthEnd).toBe("2026-10-31");
    expect(o.debtDueByMonthEnd).toBe(80 + 110 + 100 + 50);
    expect(o.billsDueByMonthEnd).toBe(450 + 199);
    expect(o.availableAfterCommitments).toBe(1000 - 340 - 649);
  });

  it("handles no debts", () => {
    const empty = debtOverview([], [], 50, TODAY);
    expect(empty).toMatchObject({ totalOutstanding: 0, activeDebts: 0, dueThisMonth: 0, nextPayment: undefined, availableAfterCommitments: 50 });
  });
});

describe("debtBreakdown", () => {
  it("splits each dashboard total by creditor, largest first", () => {
    expect(debtBreakdown(debts, items, "outstanding", TODAY)).toEqual([
      { name: "Abang Hafiz", amount: 230 },
      { name: "Shopee PayLater", amount: 200 },
      { name: "Credit card", amount: 110 },
    ]);
    expect(debtBreakdown(debts, items, "month", TODAY)).toEqual([
      { name: "Abang Hafiz", amount: 230 },
      { name: "Credit card", amount: 110 },
    ]);
    expect(debtBreakdown(debts, items, "next7", TODAY)).toEqual([
      { name: "Credit card", amount: 110 },
      { name: "Abang Hafiz", amount: 100 },
    ]);
  });

  it("adds up to the overview figures", () => {
    const o = debtOverview(debts, items, 0, TODAY);
    const sum = (k: "outstanding" | "month" | "next7" | "overdue") => debtBreakdown(debts, items, k, TODAY).reduce((s, r) => s + r.amount, 0);
    expect(sum("outstanding")).toBe(o.totalOutstanding);
    expect(sum("month")).toBe(o.dueThisMonth);
    expect(sum("next7")).toBe(o.dueNext7Days);
    expect(sum("overdue")).toBe(o.overdue);
  });

  it("adds debts with the same name together", () => {
    const twin = debt("d5", "Shopee PayLater", 50, [inst("t1", "2026-10-12", 50)]);
    expect(debtBreakdown([shopee, twin], buildPayments([shopee, twin], [], TODAY), "outstanding", TODAY)).toEqual([
      { name: "Shopee PayLater", amount: 250 },
    ]);
  });
});

describe("extraPaymentScenario", () => {
  // RM400 left as 4 × RM100, Nov–Feb
  const loan = debt("x", "Loan", 400, [
    inst("x1", "2026-11-10", 100), inst("x2", "2026-12-10", 100), inst("x3", "2027-01-10", 100), inst("x4", "2027-02-10", 100),
  ]);

  it("clears the last instalments first and never invents interest", () => {
    const s = extraPaymentScenario(loan, 200, TODAY);
    expect(s).toMatchObject({
      extra: 200, outstandingAfter: 200, instalmentsBefore: 4, instalmentsAfter: 2,
      payoffBefore: "2027-02-10", payoffAfter: "2026-12-10", interestSavedEstimate: undefined,
    });
  });

  it("a partial cover shortens nothing but still lowers the balance", () => {
    expect(extraPaymentScenario(loan, 50, TODAY)).toMatchObject({ outstandingAfter: 350, instalmentsAfter: 4, payoffAfter: "2027-02-10" });
  });

  it("estimates interest saved only from a known rate", () => {
    const withRate = { ...loan, interestRate: 12 };
    // Each RM100 paid today instead of on its due date (Feb 10 and Jan 10) saves 12% p.a. for those days
    const s = extraPaymentScenario(withRate, 200, TODAY);
    const expected = (100 * 0.12 * daysBetween(TODAY, "2027-02-10")) / 365 + (100 * 0.12 * daysBetween(TODAY, "2027-01-10")) / 365;
    expect(s.interestSavedEstimate).toBe(Math.round(expected * 100) / 100);
  });

  it("says it in one sentence, including a full payoff", () => {
    expect(payoffSummary(extraPaymentScenario(loan, 200, TODAY), (d) => d)).toBe("Finish 2 instalments sooner: last payment 2026-12-10 instead of 2027-02-10.");
    expect(payoffSummary(extraPaymentScenario(loan, 400, TODAY), (d) => d)).toBe("That pays it off completely, with nothing left to schedule.");
  });

  it("caps the extra at what is owed", () => {
    expect(extraPaymentScenario(loan, 999, TODAY)).toMatchObject({ extra: 400, outstandingAfter: 0, instalmentsAfter: 0, payoffAfter: undefined });
  });
});

describe("balanceHistory", () => {
  const base = debt("h", "Phone", 359.6, [], { startDate: "2026-07-12" });

  it("steps down by the principal of each payment, from the balance before the first one", () => {
    const d = { ...base, payments: [{ date: "2026-08-12", principal: 89.9 }, { date: "2026-09-12", principal: 89.9 }] };
    expect(balanceHistory(d)).toEqual([
      { date: "2026-07-12", balance: 539.4 },
      { date: "2026-08-12", balance: 449.5 },
      { date: "2026-09-12", balance: 359.6 },
    ]);
  });

  it("merges payments made on the same day", () => {
    const d = { ...base, outstandingBalance: 200, startDate: undefined, payments: [{ date: "2026-10-01", principal: 40 }, { date: "2026-10-01", principal: 60 }] };
    expect(balanceHistory(d)).toEqual([
      { date: "2026-10-01", balance: 300 },
      { date: "2026-10-01", balance: 200 },
    ]);
  });

  it("has no history to show without recorded payments", () => {
    expect(balanceHistory(base)).toEqual([]);
  });
});

describe("dueWithin and groupByCreditor", () => {
  const phone = debt("p", "SPayLater – phone", 180, [inst("p1", "2026-10-12", 90), inst("p2", "2026-11-12", 90)]);
  const buds = debt("h", "SPayLater – headphones", 90, [inst("h1", "2026-10-14", 45), inst("h2", "2026-11-14", 45)]);
  const card = debt("c", "Maybank card", 500, [inst("c1", "2026-10-14", 200)], { interestRate: 15 });
  const late = debt("l", "Grab PayLater", 60, [inst("l1", "2026-10-05", 30), inst("l2", "2026-11-05", 30)]);
  const done = debt("d", "Atome", 50, [inst("d1", "2026-10-11", 50, 50)]);
  const debts = [phone, buds, card, late, done];
  const items = buildPayments(debts, [bill("b", "Rent share", "2026-11-20", 400)], TODAY);

  it("keeps unpaid items due by today + N days, overdue included", () => {
    const keys = (xs: { key: string }[]) => xs.map((x) => x.key).sort();
    expect(keys(dueWithin(items, 7, TODAY))).toEqual(["inst:c1", "inst:h1", "inst:l1", "inst:p1"]);
    expect(keys(dueWithin(items, 30, TODAY))).toEqual(["inst:c1", "inst:h1", "inst:l1", "inst:l2", "inst:p1"]);
    expect(totalDue(dueWithin(items, 30, TODAY))).toBe(90 + 45 + 200 + 30 + 30);
  });

  it("strips the plan name to find the creditor", () => {
    expect(creditorOf("SPayLater – phone")).toBe("SPayLater");
    expect(creditorOf("Hong Leong Bank - espresso machine")).toBe("Hong Leong Bank");
    expect(creditorOf("Kopi Bumi Roasters")).toBe("Kopi Bumi Roasters");
  });

  it("groups plans by creditor and orders overdue, then soonest, then highest rate", () => {
    const groups = groupByCreditor(dueWithin(items, 30, TODAY), debts);
    expect(groups.map((g) => g.creditor)).toEqual(["Grab PayLater", "SPayLater", "Maybank card"]);
    const spay = groups[1];
    expect(spay.items.map((i) => i.key)).toEqual(["inst:p1", "inst:h1"]);
    expect(spay.total).toBe(135);
    expect(groups[0].overdue).toBe(30);
    // Same next due date (14 Oct): the known 15% rate outranks SPayLater's unknown one.
    const tie = groupByCreditor(dueWithin(items, 30, TODAY).filter((i) => i.key !== "inst:p1"), debts);
    expect(tie.map((g) => g.creditor)).toEqual(["Grab PayLater", "Maybank card", "SPayLater"]);
  });
});
