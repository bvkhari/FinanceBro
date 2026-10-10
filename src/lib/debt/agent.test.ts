import { describe, expect, it } from "vitest";
import type { Debt, DebtInstalment, FinancialCommitment } from "../types";
import type { CashFlow } from "../cashflow";
import { buildPayments } from "./payments";
import { answerDebtQuestion, DebtAgentContext } from "./agent";

const TODAY = "2026-10-10";

const inst = (id: string, dueDate: string, amount: number): DebtInstalment => ({
  id, debtId: "", dueDate, amount, amountPaid: 0, remaining: amount, status: dueDate < TODAY ? "overdue" : "upcoming",
});

function debt(id: string, name: string, debtType: Debt["debtType"], instalments: DebtInstalment[], extra: Partial<Debt> = {}): Debt {
  const owed = instalments.reduce((s, i) => s + i.remaining, 0);
  return {
    id, profileId: "p", mode: "individual", name, debtType, originalAmount: owed, outstandingBalance: owed,
    frequency: "monthly", status: "active", isSample: true, createdAt: "", instalments,
    nextInstalment: instalments[0], unscheduledBalance: 0, payments: [], ...extra,
  };
}

const shopee = debt("d1", "Shopee PayLater", "bnpl", [inst("s1", "2026-10-15", 100), inst("s2", "2026-11-15", 100)]);
const spay = debt("d2", "SPayLater – phone", "bnpl", [inst("p1", "2026-10-11", 89.9)]);
const family = debt("d3", "Abang Hafiz", "family_friend", [inst("f1", "2026-10-05", 80)], { interestRate: undefined });
const supplier = debt("d4", "Kopi Bumi Roasters", "supplier_invoice", [inst("k1", "2026-10-12", 1680)], { mode: "business", referenceNo: "KBR-1001" });
const rent: FinancialCommitment = { id: "b1", mode: "individual", name: "Room rent", amount: 450, dueDate: "2026-10-11", category: "Rent", status: "upcoming", recurring: true, createdAt: "" };

const debts = [shopee, spay, family];
const cashFlow = { monthEnd: "2026-10-31", projectedCash: 250 } as CashFlow;
const ctx: DebtAgentContext = {
  debts, payments: buildPayments(debts, [rent], TODAY), allDebts: [...debts, supplier], cashFlow, balance: 720, today: TODAY,
};
const ask = (q: string) => answerDebtQuestion(q, ctx);

describe("answerDebtQuestion: the spec's example questions", () => {
  it("How much debt do I have?", () => {
    const a = ask("How much debt do I have?")!;
    expect(a).toContain("You owe RM 369.90 across 3 debts");
    expect(a).toContain("Only RM 269.90 of that is due this month");
    expect(a).toContain("How I worked it out");
  });

  it("How much do I owe Shopee? (SPayLater counts as Shopee)", () => {
    const a = ask("How much do I owe Shopee?")!;
    expect(a).toContain("You owe RM 289.90");
    expect(a).toContain("Shopee PayLater: RM 200.00");
    expect(a).toContain("SPayLater – phone: RM 89.90");
  });

  it("Who do I need to pay this week? (bills included)", () => {
    const a = ask("Who do I need to pay this week?")!;
    expect(a).toContain("you need to pay RM 639.90");
    expect(a).toMatch(/Room rent[\s\S]*SPayLater[\s\S]*Shopee PayLater/);
    expect(a).not.toContain("Abang Hafiz"); // overdue, not this week
  });

  it("What payments are due tomorrow?", () => {
    const a = ask("What payments are due tomorrow?")!;
    expect(a).toContain("Due tomorrow (11 Oct), RM 539.90");
  });

  it("How much debt repayment do I need this month?", () => {
    const a = ask("How much debt repayment do I need this month?")!;
    expect(a).toContain("RM 269.90 in debt repayments this month");
    expect(a).not.toContain("Room rent");
  });

  it("Which payments are overdue?", () => {
    expect(ask("Which payments are overdue?")).toContain("1 overdue, RM 80.00 in total");
  });

  it("How much will I still owe after this month's repayments?", () => {
    expect(ask("How much will I still owe after this month's repayments?")).toContain("About RM 100.00");
  });

  it("Can I afford to pay an extra RM200 towards my loan?", () => {
    const a = ask("Can I afford to pay an extra RM200 towards my loan?")!;
    expect(a).toMatch(/^Yes\. Your projected cash on 31 Oct is RM 250\.00\. Paying RM 200\.00 extra now leaves RM 50\.00/);
    expect(a).toContain("Abang Hafiz (the only loan on this profile): owed drops from RM 80.00 to RM 0.00. That pays it off completely");
    expect(a).toContain("can't say how much interest");
    expect(ask("Can I afford an extra RM300 towards Shopee?")).toMatch(/^Not this month/);
  });

  it("Show my business supplier debts. (works from the personal profile too)", () => {
    const a = ask("Show my business supplier debts.")!;
    expect(a).toContain("You owe 1 supplier RM 1,680.00");
    expect(a).toContain("Kopi Bumi Roasters (KBR-1001)");
  });
});

describe("answerDebtQuestion: asks instead of guessing", () => {
  it("asks for the amount when none is given", () => {
    expect(ask("Can I pay extra towards my loan?")).toMatch(/^How much extra/);
  });

  it("asks which debt when the name isn't found", () => {
    expect(ask("How much do I owe Atome?")).toMatch(/^I couldn't find that debt\. You owe: Shopee PayLater, SPayLater – phone, Abang Hafiz/);
  });

  it("leaves non-debt questions to the rest of the chat", () => {
    expect(ask("Bro, I spent RM59 today.")).toBeNull();
    expect(ask("Help me manage my monthly budget.")).toBeNull();
  });
});
