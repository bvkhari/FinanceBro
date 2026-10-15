// ============================================================
// Debt Agent: answers PayLater questions from the app's own numbers.
// The figures come from payments.ts / cashflow.ts; this file only
// picks the question and writes the answer. Returns null when the
// text isn't a debt question, so the chat can try its other answers.
// ponytail: keyword matching, not an LLM. The same functions can
// become LLM tools once there is an /api/chat route and an API key.
// ============================================================

import { Debt } from "../types";
import { formatRM, formatDateShort } from "../utils";
import type { CashFlow } from "../cashflow";
import { PaymentItem, addDays, countdown, debtOverview, extraPaymentScenario, filterPayments, payoffSummary, totalDue } from "./payments";

export interface DebtAgentContext {
  debts: Debt[]; // PayLater plans
  payments: PaymentItem[]; // their instalments
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
const GENERIC = new Set(["with", "from"]);
// SPayLater is Shopee's pay-later product. "paylater" / "bnpl" mean every BNPL app.
const BNPL = ["shopee", "spaylater", "tiktok", "grab", "atome", "paylater"];
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

  // "Can I afford to pay an extra RM200 towards Atome?"
  if (/\bextra\b|\btowards\b/.test(t)) {
    if (!(amount > 0)) return "How much extra do you want to pay? For example: \"Can I afford an extra RM200 towards Atome?\"";
    const after = (cents(ctx.cashFlow.projectedCash) - cents(amount)) / 100;
    let reply =
      `${after >= 0 ? "Yes" : "Not this month"}. Your projected cash on ${monthEnd} is ${formatRM(ctx.cashFlow.projectedCash)}. ` +
      `Paying ${formatRM(amount)} extra now leaves ${formatRM(after)}.`;
    const hits = matchDebts(t, active);
    const target = hits.length === 1 ? hits[0] : active.length === 1 ? active[0] : undefined;
    if (target) {
      const s = extraPaymentScenario(target, amount, today);
      const picked = hits.length === 1 ? "" : " (your only PayLater plan)";
      reply +=
        `\n\n${target.name}${picked}: owed drops from ${formatRM(target.outstandingBalance)} to ${formatRM(s.outstandingAfter)}. ` +
        payoffSummary(s, formatDateShort) +
        (s.interestSavedEstimate !== undefined ? ` About ${formatRM(s.interestSavedEstimate)} less interest (estimate at ${target.interestRate}% p.a.).` : " No interest rate on record, so I can't say how much interest you'd save.");
    } else {
      const options = active.map((d) => d.name).join(", ");
      if (options) reply += `\n\nWhich plan is it for (${options})? Then I can show how much sooner it would be paid off.`;
    }
    return reply + how(`projected cash = cash now + confirmed income − PayLater instalments due by ${monthEnd}; then minus the extra. Nothing is paid automatically.`);
  }

  // "Which payments are overdue?"
  if (/overdue|late|past due/.test(t)) {
    const late = filterPayments(payments, "overdue", today);
    if (!late.length) return "Nothing is overdue." + how("every unpaid PayLater instalment with a due date before today.");
    return `${late.length} overdue, ${formatRM(totalDue(late))} in total:\n${lines(late, today)}` + how("unpaid PayLater instalments with a due date before today.");
  }

  // "What payments are due tomorrow?"
  if (/tomorrow/.test(t)) {
    const tmr = addDays(today, 1);
    const due = payments.filter((p) => p.remaining > 0 && p.dueDate === tmr);
    if (!due.length) return `Nothing is due tomorrow (${formatDateShort(tmr)}).`;
    return `Due tomorrow (${formatDateShort(tmr)}), ${formatRM(totalDue(due))}:\n${lines(due, today)}` + how("unpaid instalments whose saved due date is tomorrow.");
  }

  // "Who do I need to pay this week?"
  if (/this week|next 7|7 days|who do i (need to )?pay/.test(t)) {
    const week = filterPayments(payments, "next7", today);
    if (!week.length) return "Nothing is due in the next 7 days.";
    return (
      `In the next 7 days (to ${formatDateShort(addDays(today, 7))}) you need to pay ${formatRM(totalDue(week))}:\n${lines(week, today)}` +
      how("unpaid PayLater instalments due from today to 7 days from now, partly paid ones at what's left.")
    );
  }

  // "How much will I still owe after this month's repayments?"
  if (/after this month|still owe/.test(t)) {
    const left = (cents(o.totalOutstanding) - cents(o.debtDueByMonthEnd)) / 100;
    return (
      `About ${formatRM(left)}. You owe ${formatRM(o.totalOutstanding)} now, and ${formatRM(o.debtDueByMonthEnd)} of instalments are due by ${monthEnd}.` +
      how("total owed − instalments due by month end (overdue included). This assumes every repayment goes to the balance; any part you record as interest or late fees won't reduce it.")
    );
  }

  // "How much debt repayment do I need this month?"
  if (/this month/.test(t) && /repay|pay|due/.test(t)) {
    const month = filterPayments(payments, "month", today).filter((p) => p.kind === "debt");
    if (!month.length) return "No PayLater instalments are left to pay this month.";
    return `${formatRM(o.dueThisMonth)} in PayLater instalments this month:\n${lines(month, today)}` + how(`unpaid instalments due this month, overdue ones included.`);
  }

  // "How much do I owe Shopee?"
  const hits = matchDebts(t, debts);
  if (/\bowe\b/.test(t) && hits.length) {
    return (
      `You owe ${formatRM(sum(hits.map((d) => d.outstandingBalance)))}:\n` +
      hits.map((d) => `• ${d.name}: ${formatRM(d.outstandingBalance)}` + (d.nextInstalment ? `, next ${formatRM(d.nextInstalment.remaining)} on ${formatDateShort(d.nextInstalment.dueDate)}` : "")).join("\n") +
      how("the outstanding balance of each matching plan, as recorded after your last payment.")
    );
  }

  // "How much do I owe Atome?" with no such debt: ask instead of answering with the total.
  if (/\bowe\s+(?!in total|altogether|overall|now|right now)[a-z]/.test(t) && !hits.length) {
    return `I couldn't find that PayLater plan. You owe: ${active.map((d) => d.name).join(", ") || "nothing"}. Which one do you mean?`;
  }

  // "How much debt do I have?"
  if (/how much debt|total debt|debt do i have|how much do i owe|owe in total/.test(t)) {
    if (!active.length) return "You have no active PayLater plans.";
    return (
      `You owe ${formatRM(o.totalOutstanding)} across ${active.length} PayLater plan${active.length === 1 ? "" : "s"}:\n` +
      active.map((d) => `• ${d.name}: ${formatRM(d.outstandingBalance)}`).join("\n") +
      `\n\nOnly ${formatRM(o.dueThisMonth)} of that is due this month.` +
      how("the outstanding balance of every active plan. What's due this month is the unpaid instalments dated this month.")
    );
  }

  return null;
}
