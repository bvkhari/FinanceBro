// ============================================================
// Debt Agent: answers debt questions from the app's own numbers.
// The figures come from payments.ts / cashflow.ts; this file only
// picks the question and writes the answer. Returns null when the
// text isn't a debt question, so the chat can try its other answers.
// ponytail: keyword matching, not an LLM. The same functions can
// become LLM tools once there is an /api/chat route and an API key.
// ============================================================

import { Debt } from "../types";
import { formatRM, formatDateShort } from "../utils";
import type { CashFlow } from "../cashflow";
import { DEBT_TYPE_LABELS } from "./labels";
import { PaymentItem, addDays, countdown, debtOverview, extraPaymentScenario, filterPayments, payoffSummary, totalDue } from "./payments";

export interface DebtAgentContext {
  debts: Debt[]; // active profile
  payments: PaymentItem[]; // active profile: debt instalments and bills
  allDebts: Debt[]; // both profiles, for questions about the business
  cashFlow: CashFlow;
  balance: number;
  today: string;
}

const cents = (n: number) => Math.round(n * 100);
const sum = (xs: number[]) => xs.reduce((s, x) => s + cents(x), 0) / 100;
const how = (text: string) => `\n\nHow I worked it out: ${text}`;
const lines = (items: PaymentItem[], today: string) =>
  items.map((p) => `• ${p.payee}: ${formatRM(p.remaining)}, ${formatDateShort(p.dueDate)} (${countdown(p.dueDate, today, p.status).toLowerCase()})`).join("\n");

// Words in a debt's name that identify it. Generic words would match too much.
const GENERIC = new Set(["bank", "card", "loan", "business", "invoice", "with", "from", "machine", "working", "capital"]);
// SPayLater is Shopee's pay-later product. "paylater" / "bnpl" mean every BNPL app.
const BNPL = ["shopee", "spaylater", "tiktok", "atome", "paylater"];
const ALIASES: Record<string, string[]> = { shopee: ["spaylater"], paylater: BNPL, bnpl: BNPL };

function matchDebts(text: string, debts: Debt[]): Debt[] {
  const t = text.toLowerCase();
  const wanted = new Set(t.split(/[^a-z0-9]+/).flatMap((w) => [w, ...(ALIASES[w] ?? [])]));
  return debts.filter((d) =>
    d.status === "active" &&
    d.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 4 && !GENERIC.has(w) && wanted.has(w))
  );
}

export function answerDebtQuestion(text: string, ctx: DebtAgentContext): string | null {
  const t = text.toLowerCase();
  const { debts, payments, today } = ctx;
  const o = debtOverview(debts, payments, ctx.balance, today);
  const active = debts.filter((d) => d.status === "active");
  const monthEnd = formatDateShort(ctx.cashFlow.monthEnd);
  const amount = Number(text.match(/RM\s?(\d+(?:\.\d+)?)/i)?.[1] ?? text.match(/\b(\d+(?:\.\d+)?)\b/)?.[1] ?? NaN);

  // "Can I afford to pay an extra RM200 towards my loan?"
  if (/\bextra\b|\btowards\b/.test(t)) {
    if (!(amount > 0)) return "How much extra do you want to pay? For example: \"Can I afford an extra RM200 towards my loan?\"";
    const after = (cents(ctx.cashFlow.projectedCash) - cents(amount)) / 100;
    let reply =
      `${after >= 0 ? "Yes" : "Not this month"}. Your projected cash on ${monthEnd} is ${formatRM(ctx.cashFlow.projectedCash)}. ` +
      `Paying ${formatRM(amount)} extra now leaves ${formatRM(after)}.`;
    const hits = matchDebts(t, active);
    const byType = /\bloan\b/.test(t) ? active.filter((d) => /loan|financing|family/.test(d.debtType)) : [];
    const target = hits.length === 1 ? hits[0] : byType.length === 1 ? byType[0] : undefined;
    if (target) {
      const s = extraPaymentScenario(target, amount, today);
      const picked = hits.length === 1 ? "" : " (the only loan on this profile)";
      reply +=
        `\n\n${target.name}${picked}: owed drops from ${formatRM(target.outstandingBalance)} to ${formatRM(s.outstandingAfter)}. ` +
        payoffSummary(s, formatDateShort) +
        (s.interestSavedEstimate !== undefined ? ` About ${formatRM(s.interestSavedEstimate)} less interest (estimate at ${target.interestRate}% p.a.).` : " No interest rate on record, so I can't say how much interest you'd save.");
    } else {
      const options = (byType.length > 1 ? byType : active).map((d) => d.name).join(", ");
      if (options) reply += `\n\nWhich debt is it for (${options})? Then I can show how much sooner it would be paid off.`;
    }
    return reply + how(`projected cash = cash now + confirmed income − bills and repayments due by ${monthEnd}; then minus the extra. Nothing is paid automatically.`);
  }

  // "Show my business supplier debts."
  if (/supplier/.test(t)) {
    const sup = ctx.allDebts.filter((d) => d.debtType === "supplier_invoice" && d.status === "active");
    if (!sup.length) return "You have no unpaid supplier invoices.";
    return (
      `You owe ${sup.length} supplier${sup.length === 1 ? "" : "s"} ${formatRM(sum(sup.map((d) => d.outstandingBalance)))}:\n` +
      sup.map((d) => `• ${d.name}${d.referenceNo ? ` (${d.referenceNo})` : ""}: ${formatRM(d.outstandingBalance)}, due ${d.nextInstalment ? formatDateShort(d.nextInstalment.dueDate) : "—"}`).join("\n") +
      how("the outstanding balance of every active supplier invoice on the business profile.")
    );
  }

  // "Which payments are overdue?"
  if (/overdue|late|past due/.test(t)) {
    const late = filterPayments(payments, "overdue", today);
    if (!late.length) return "Nothing is overdue." + how("every unpaid debt instalment and bill with a due date before today.");
    return `${late.length} overdue, ${formatRM(totalDue(late))} in total:\n${lines(late, today)}` + how("unpaid debt instalments and bills with a due date before today.");
  }

  // "What payments are due tomorrow?"
  if (/tomorrow/.test(t)) {
    const tmr = addDays(today, 1);
    const due = payments.filter((p) => p.remaining > 0 && p.dueDate === tmr);
    if (!due.length) return `Nothing is due tomorrow (${formatDateShort(tmr)}).`;
    return `Due tomorrow (${formatDateShort(tmr)}), ${formatRM(totalDue(due))}:\n${lines(due, today)}` + how("unpaid items whose saved due date is tomorrow.");
  }

  // "Who do I need to pay this week?"
  if (/this week|next 7|7 days|who do i (need to )?pay/.test(t)) {
    const week = filterPayments(payments, "next7", today);
    if (!week.length) return "Nothing is due in the next 7 days.";
    return (
      `In the next 7 days (to ${formatDateShort(addDays(today, 7))}) you need to pay ${formatRM(totalDue(week))}:\n${lines(week, today)}` +
      how("unpaid debt instalments and bills due from today to 7 days from now, partly paid ones at what's left.")
    );
  }

  // "How much will I still owe after this month's repayments?"
  if (/after this month|still owe/.test(t)) {
    const left = (cents(o.totalOutstanding) - cents(o.debtDueByMonthEnd)) / 100;
    return (
      `About ${formatRM(left)}. You owe ${formatRM(o.totalOutstanding)} now, and ${formatRM(o.debtDueByMonthEnd)} of repayments are due by ${monthEnd}.` +
      how("outstanding debt − repayments due by month end (overdue included). This assumes every repayment goes to the balance; any part you record as interest or fees won't reduce it.")
    );
  }

  // "How much debt repayment do I need this month?"
  if (/this month/.test(t) && /repay|pay|due/.test(t)) {
    const month = filterPayments(payments, "month", today).filter((p) => p.kind === "debt");
    if (!month.length) return "No debt repayments are left to pay this month.";
    return `${formatRM(o.dueThisMonth)} in debt repayments this month:\n${lines(month, today)}` + how(`unpaid debt instalments due this month, overdue ones included. Bills aren't counted here.`);
  }

  // "How much do I owe Shopee?"
  const hits = matchDebts(t, ctx.allDebts);
  if (/\bowe\b/.test(t) && hits.length) {
    return (
      `You owe ${formatRM(sum(hits.map((d) => d.outstandingBalance)))}:\n` +
      hits.map((d) => `• ${d.name}: ${formatRM(d.outstandingBalance)}` + (d.nextInstalment ? `, next ${formatRM(d.nextInstalment.remaining)} on ${formatDateShort(d.nextInstalment.dueDate)}` : "")).join("\n") +
      how("the outstanding balance of each matching debt, as recorded after your last payment.")
    );
  }

  // "How much do I owe Atome?" with no such debt: ask instead of answering with the total.
  if (/\bowe\s+(?!in total|altogether|overall|now|right now)[a-z]/.test(t) && !hits.length) {
    return `I couldn't find that debt. You owe: ${active.map((d) => d.name).join(", ") || "nothing"}. Which one do you mean?`;
  }

  // "How much debt do I have?"
  if (/how much debt|total debt|debt do i have|how much do i owe|owe in total/.test(t)) {
    if (!active.length) return "You have no active debts.";
    return (
      `You owe ${formatRM(o.totalOutstanding)} across ${active.length} debt${active.length === 1 ? "" : "s"}:\n` +
      active.map((d) => `• ${d.name} (${DEBT_TYPE_LABELS[d.debtType]}): ${formatRM(d.outstandingBalance)}`).join("\n") +
      `\n\nOnly ${formatRM(o.dueThisMonth)} of that is due this month.` +
      how("the outstanding balance of every active debt. What's due this month is the unpaid instalments dated this month.")
    );
  }

  return null;
}
