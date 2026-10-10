"use client";

import { useFinance } from "@/lib/FinanceContext";
import { MoneyCard } from "@/components/ui/MoneyCard";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  CreditCard,
  CalendarClock,
  Plus,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { useDebtView } from "@/lib/debt/useDebtView";
import type { CashFlow } from "@/lib/cashflow";
import { addDays, dueWithin, groupByCreditor, totalDue } from "@/lib/debt/payments";
import { CreditorGroups } from "@/components/debt/CreditorGroups";
import { Modal } from "@/components/ui/Modal";
import { AddPicker } from "@/components/AddPicker";
import { formatRM, formatDateShort } from "@/lib/utils";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";
import Link from "next/link";

const tooltipStyle = {
  contentStyle: {
    background: "rgb(var(--elevated))",
    border: "none",
    borderRadius: 12,
    boxShadow: "var(--shadow-float)",
    fontSize: 12,
    padding: "8px 12px",
  },
  labelStyle: { color: "rgb(var(--label))", fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: "rgb(var(--label))", padding: 0 },
  cursor: { fill: "rgb(var(--gray) / 0.08)" },
};
const tick = { fontSize: 11, fill: "rgb(var(--label-2) / 0.62)" };

export default function DashboardPage() {
  const {
    mode,
    profile,
    summary,
    budget,
    categoryBreakdown,
    incomeExpenseData,
    transactions,
    cashFlow,
  } = useFinance();
  const [budgetPeriod, setBudgetPeriod] = useState<"weekly" | "monthly">("monthly");
  const [workspace, setWorkspace] = useState<"expenses" | "debt">("debt");

  const recentTransactions = transactions.slice(0, 5);

  // Weekly budget calculation
  const weeklySpent = budget.spent / 4.33;
  const weeklyBudget = profile.monthlyBudget / 4.33;
  const weeklyRemaining = Math.max(0, weeklyBudget - weeklySpent);
  const weeklyPercent = weeklyBudget > 0 ? Math.round((weeklySpent / weeklyBudget) * 100) : 0;

  const displayBudget = budgetPeriod === "weekly"
    ? { total: weeklyBudget, spent: weeklySpent, remaining: weeklyRemaining, percent: weeklyPercent }
    : { total: budget.totalBudget, spent: budget.spent, remaining: budget.remaining, percent: budget.percentageUsed };

  const budgetTone =
    displayBudget.percent > 80 ? "bg-negative" : displayBudget.percent > 60 ? "bg-warning" : "bg-positive";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <PageHeader
        title="Dashboard"
        subtitle={`Hi ${profile.displayName.split(" ")[0]}. Here's your ${mode === "individual" ? "personal" : "business"} money this month.`}
      />

      <div className="mb-8 grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
        <MoneyCard
          className="lg:col-span-3"
          label="Balance"
          tag={mode === "individual" ? "Personal" : "Business"}
          value={summary.currentBalance}
          stats={[
            { label: "Income", value: summary.totalMonthlyIncome, tone: "positive" },
            { label: "Spent", value: summary.totalMonthlyExpenses, tone: "negative" },
          ]}
        />
        <QuickActions className="lg:col-span-2" />
      </div>

      <div className="mb-6">
        <Segmented
          aria-label="Workspace"
          className="w-full sm:w-64"
          value={workspace}
          onChange={setWorkspace}
          options={[
            { value: "debt", label: "Debt" },
            { value: "expenses", label: "Expenses" },
          ]}
        />
      </div>

      {workspace === "expenses" ? (
        <div key="expenses" className="animate-rise space-y-8">

          {/* Budget — the period control sits next to the numbers it changes */}
          <Card
            title="Budget"
            action={
              <Segmented
                aria-label="Budget period"
                size="sm"
                className="w-40"
                value={budgetPeriod}
                onChange={setBudgetPeriod}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
            }
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="tabular text-title1">{formatRM(displayBudget.remaining)}</p>
                <p className="mt-0.5 text-subhead text-label-2">
                  left of {formatRM(displayBudget.total)} · {formatRM(displayBudget.spent)} spent
                </p>
              </div>
              <p className="tabular text-title3 text-label-2">{displayBudget.percent}%</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray/16">
              <div
                className={`h-full w-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-spring ${budgetTone}`}
                style={{ transform: `scaleX(${Math.min(displayBudget.percent, 100) / 100})` }}
              />
            </div>
          </Card>

          <CashFlowCard f={cashFlow} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-4">
            <Card title="Income and expenses" className="lg:col-span-3">
              <div className="mb-2 flex gap-4 text-footnote text-label-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-positive" />Income</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-negative" />Expenses</span>
              </div>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incomeExpenseData} barGap={3} barCategoryGap="28%">
                    <CartesianGrid stroke="var(--separator)" vertical={false} />
                    <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                    <Tooltip {...tooltipStyle} formatter={(value: number) => formatRM(value)} />
                    <Bar dataKey="income" fill="rgb(var(--positive))" radius={[4, 4, 0, 0]} name="Income" />
                    <Bar dataKey="expenses" fill="rgb(var(--negative))" radius={[4, 4, 0, 0]} name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Where it went" className="lg:col-span-2">
              {categoryBreakdown.length === 0 ? (
                <p className="py-16 text-center text-subhead text-label-2">No spending yet this month.</p>
              ) : (
                <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col">
                  <div className="h-36 w-36 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryBreakdown}
                          dataKey="amount"
                          nameKey="category"
                          innerRadius="66%"
                          outerRadius="100%"
                          paddingAngle={2}
                          stroke="none"
                          cornerRadius={3}
                        >
                          {categoryBreakdown.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(value: number) => formatRM(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="w-full min-w-0 flex-1 space-y-2">
                    {categoryBreakdown.slice(0, 5).map((c) => (
                      <li key={c.category} className="flex items-center gap-2 text-subhead">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="truncate text-label">{c.category}</span>
                        <span className="tabular ml-auto text-label-2">{c.percentage}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-4">
            <Card title="Recent" flush action={<SeeAll href="/transactions" />}>
              {recentTransactions.length === 0 ? (
                <p className="py-10 text-center text-subhead text-label-2">No transactions yet.</p>
              ) : (
                <ul className="grouped-inset">
                  {recentTransactions.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <RowIcon tone={t.type === "income" ? "positive" : "negative"}>
                        {t.type === "income" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </RowIcon>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-label">{t.name}</p>
                        <p className="text-footnote text-label-2">{t.category} · {formatDateShort(t.date)}</p>
                      </div>
                      <p className={`tabular text-body font-medium ${t.type === "income" ? "text-positive" : "text-label"}`}>
                        {t.type === "income" ? "+" : "−"}{formatRM(t.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <AskCard />
          </div>
        </div>
      ) : (
        <DebtWorkspace f={cashFlow} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Cash flow: this month's cash, and where it lands at month end
// ------------------------------------------------------------

function CashFlowCard({ f }: { f: CashFlow }) {
  const start = formatDateShort(f.monthStart);
  const end = formatDateShort(f.monthEnd);
  const Row = ({ label, value, sign, strong }: { label: string; value: number; sign?: "+" | "−"; strong?: boolean }) => (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "py-3" : "py-2.5"}`}>
      <dt className={strong ? "text-headline" : "text-body text-label-2"}>{label}</dt>
      <dd
        className={`tabular ${strong ? `text-title3 ${value < 0 ? "text-negative" : "text-label"}` : `text-body ${sign === "−" ? "text-negative" : sign === "+" ? "text-positive" : ""}`}`}
      >
        {sign && value !== 0 ? sign : ""}
        {formatRM(value)}
      </dd>
    </div>
  );

  return (
    <Card title="Cash flow" flush>
      <div className="grid grid-cols-1 divide-y divide-[color:var(--separator)] md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="px-4 py-2">
          <p className="pt-2 text-footnote font-semibold uppercase tracking-wide text-label-3">This month so far</p>
          <dl className="grouped">
            <Row label={`Cash on ${start}`} value={f.openingCash} />
            <Row label="Income received" value={f.incomeReceived} sign="+" />
            <Row label="Expenses paid in cash" value={f.cashExpensesPaid} sign="−" />
            <Row label="Debt repayments paid" value={f.debtRepaymentsPaid} sign="−" />
            <Row label="Available cash" value={f.availableCash} strong />
          </dl>
        </div>
        <div className="px-4 py-2">
          <p className="pt-2 text-footnote font-semibold uppercase tracking-wide text-label-3">Projected by {end}</p>
          <dl className="grouped">
            <Row label="Available cash" value={f.availableCash} />
            <Row label="Expected income (confirmed)" value={f.expectedIncomeConfirmed} sign="+" />
            <Row label="Bills still to pay" value={f.billsDue} sign="−" />
            <Row label="Debt repayments due" value={f.debtRepaymentsDue} sign="−" />
            <Row label={`Cash on ${end}`} value={f.projectedCash} strong />
          </dl>
        </div>
      </div>
      <ul className="space-y-1 px-4 pb-4 pt-1 text-footnote text-label-2 shadow-[inset_0_0.5px_0_var(--separator)]">
        <li className="pt-3">
          Bills and repayments count only what is due by {end} (overdue included), never the whole outstanding debt.
        </li>
        {f.expectedIncomeUnconfirmed > 0 && (
          <li>
            Unconfirmed income of {formatRM(f.expectedIncomeUnconfirmed)} isn&apos;t included. If it arrives, you&apos;d have{" "}
            {formatRM(f.projectedWithUnconfirmed)} on {end}.
          </li>
        )}
        {f.spentOnCredit > 0 && (
          <li>
            {formatRM(f.spentOnCredit)} of this month&apos;s spending was bought on credit, so it isn&apos;t cash yet. It leaves your
            account when you repay it.
          </li>
        )}
        <li>Debt repayments aren&apos;t counted as spending, because the purchase was counted when you made it.</li>
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------
// Debt dashboard: what is owed vs what is due, and who to pay next
// ------------------------------------------------------------

function DebtWorkspace({ f }: { f: CashFlow }) {
  const { today, debts, payments, overview: o } = useDebtView();
  const [sheet, setSheet] = useState<7 | 30 | null>(null);
  const due30 = dueWithin(payments, 30, today);
  const groups30 = groupByCreditor(due30, debts);
  const overdue = totalDue(due30.filter((p) => p.status === "overdue"));
  const due7 = totalDue(dueWithin(payments, 7, today));
  const debtDue30 = totalDue(due30.filter((p) => p.kind === "debt"));
  // Bills are due but aren't debt, so the 30-day total can exceed the outstanding debt: show the split.
  const billDue30 = Math.round((totalDue(due30) - debtDue30) * 100) / 100;
  const debtSharePct = o.totalOutstanding > 0 ? Math.min(100, (debtDue30 / o.totalOutstanding) * 100) : 0;
  const monthEnd = formatDateShort(o.monthEnd);
  const sheetItems = sheet ? dueWithin(payments, sheet, today) : [];

  return (
    <>
    <div key="debt" className="animate-rise space-y-8">
      {/* What has to go out in the next 30 days, every BNPL, card, loan and bill together. Tap for the list by creditor. */}
      <section className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <button type="button" onClick={() => setSheet(30)} className="press group flex w-full items-end justify-between gap-4 p-5 text-left">
            <div className="min-w-0">
              <p className="text-subhead text-label-2">To pay in the next 30 days</p>
              <p className="tabular mt-1 text-large-title text-label">{formatRM(totalDue(due30))}</p>
              <p className="mt-1 truncate text-subhead text-label-2">
                {due30.length === 0
                  ? "Nothing due. Nice."
                  : billDue30 === 0
                    ? `${due30.length} debt payment${due30.length === 1 ? "" : "s"} · ${groups30.length} creditor${groups30.length === 1 ? "" : "s"}`
                    : `Debts ${formatRM(debtDue30)} + bills ${formatRM(billDue30)}`}
              </p>
            </div>
            <ChevronRight className="mb-1 h-5 w-5 shrink-0 text-label-3 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
          </button>

          {/* Everything still owed, not just what is due: the bar shows how much of it falls due in the next 30 days. */}
          <Link
            href="/payments"
            className="press group flex items-end justify-between gap-4 p-5 shadow-[inset_0_0.5px_0_var(--separator)] hover:bg-gray/8 sm:shadow-[inset_0.5px_0_0_var(--separator)]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-subhead text-label-2">Total outstanding debt</p>
              <p className="tabular mt-1 text-large-title text-label">{formatRM(o.totalOutstanding)}</p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray/16" aria-hidden>
                <div className="h-full rounded-full bg-warning" style={{ width: `${debtSharePct}%` }} />
              </div>
              <p className="mt-1.5 truncate text-subhead text-label-2">
                {o.activeDebts} active debt{o.activeDebts === 1 ? "" : "s"} · {formatRM(debtDue30)} due in 30 days
              </p>
            </div>
            <ChevronRight className="mb-1 h-5 w-5 shrink-0 text-label-3 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 shadow-[inset_0_0.5px_0_var(--separator)]">
          <button type="button" onClick={() => setSheet(7)} className="press px-5 py-3.5 text-left hover:bg-gray/8">
            <p className="text-footnote text-label-2">Next 7 days</p>
            <p className="tabular mt-0.5 text-headline text-label">{formatRM(due7)}</p>
          </button>
          <button type="button" onClick={() => setSheet(30)} className="press px-5 py-3.5 text-left shadow-[inset_0.5px_0_0_var(--separator)] hover:bg-gray/8">
            <p className="text-footnote text-label-2">Overdue</p>
            <p className={`tabular mt-0.5 text-headline ${overdue > 0 ? "text-negative" : "text-label"}`}>{formatRM(overdue)}</p>
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:items-start lg:gap-4">
        <section className="lg:col-span-3">
          <header className="mb-2 flex min-h-8 items-center justify-between gap-3 px-1">
            <h2 className="text-title3 text-label">Pay first</h2>
            <SeeAll href="/payments" />
          </header>
          {groups30.length === 0 ? (
            <p className="rounded-2xl bg-surface py-10 text-center text-subhead text-label-2 shadow-card">Nothing to pay. Nice.</p>
          ) : (
            <CreditorGroups groups={groups30.slice(0, 3)} today={today} />
          )}
        </section>

        <Card title={`By ${monthEnd}`} flush className="lg:col-span-2">
          <dl className="grouped px-4">
            <div className="flex justify-between py-3">
              <dt className="text-body text-label-2">Balance</dt>
              <dd className="tabular text-body">{formatRM(f.availableCash)}</dd>
            </div>
            {/* Same projection as the Cash flow card, so both tabs show one month-end figure. */}
            {f.expectedIncomeConfirmed > 0 && (
              <div className="flex justify-between py-3">
                <dt className="text-body text-label-2">Expected income</dt>
                <dd className="tabular text-body">+{formatRM(f.expectedIncomeConfirmed)}</dd>
              </div>
            )}
            <div className="flex justify-between py-3">
              <dt className="text-body text-label-2">Repayments due</dt>
              <dd className="tabular text-body">−{formatRM(f.debtRepaymentsDue)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-body text-label-2">Bills due</dt>
              <dd className="tabular text-body">−{formatRM(f.billsDue)}</dd>
            </div>
            <div className="flex items-baseline justify-between py-3.5">
              <dt className="text-headline">Left over</dt>
              <dd className={`tabular text-title2 ${f.projectedCash < 0 ? "text-negative" : "text-label"}`}>
                {formatRM(f.projectedCash)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

    </div>

    <Modal isOpen={sheet !== null} onClose={() => setSheet(null)} title={`Next ${sheet ?? 30} days`} size="md">
      <p className="mb-4 text-subhead text-label-2">
        <span className="tabular text-title2 text-label">{formatRM(totalDue(sheetItems))}</span> to pay by{" "}
        {formatDateShort(addDays(today, sheet ?? 30))}, overdue included. Pay from the top.
      </p>
      {sheetItems.length === 0 ? (
        <p className="py-8 text-center text-subhead text-label-2">Nothing due.</p>
      ) : (
        <CreditorGroups groups={groupByCreditor(sheetItems, debts)} today={today} openFirst />
      )}
      <Link
        href={`/payments?range=${sheet ?? 30}`}
        className="press mt-4 flex h-11 items-center justify-center rounded-xl bg-accent text-headline text-white"
      >
        Record a payment
      </Link>
    </Modal>
    </>
  );
}

const QUICK = [
  { href: "/payments", label: "Pay", icon: CreditCard },
  { href: "/payments?section=bills", label: "Bills", icon: CalendarClock },
  { href: null, label: "Add", icon: Plus },
  { href: "/financebro-ai", label: "Ask AI", icon: Sparkles },
];

// Shortcut tiles under the balance card: the four things people come here to do.
// "Add" opens the same picker as the Payments page: expense, bill or debt.
function QuickActions({ className = "" }: { className?: string }) {
  const [picking, setPicking] = useState(false);
  const tile = "press flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface py-3.5 shadow-card hover:bg-gray/7";
  return (
    <nav aria-label="Quick actions" className={`grid grid-cols-4 gap-3 lg:grid-cols-2 ${className}`}>
      {QUICK.map(({ href, label, icon: Icon }) => {
        const body = (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray/12 text-label">
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="text-footnote font-medium text-label">{label}</span>
          </>
        );
        return href ? (
          <Link key={label} href={href} className={tile}>
            {body}
          </Link>
        ) : (
          <button key={label} type="button" onClick={() => setPicking(true)} className={tile}>
            {body}
          </button>
        );
      })}
      <AddPicker isOpen={picking} onClose={() => setPicking(false)} />
    </nav>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="press flex items-center gap-0.5 rounded-full px-2 py-1 text-subhead text-accent-text">
      See all
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}

function RowIcon({ tone, children }: { tone: "positive" | "negative" | "warning"; children: React.ReactNode }) {
  const cls = { positive: "bg-positive/12 text-positive", negative: "bg-negative/12 text-negative", warning: "bg-warning/12 text-warning" }[tone];
  return <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cls}`}>{children}</span>;
}

const ASK_PROMPT = "Bro, can I afford to spend RM300?";

function AskCard() {
  return (
    <Link
      href={`/financebro-ai?q=${encodeURIComponent(ASK_PROMPT)}`}
      className="press group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[rgb(10_124_114)] to-[rgb(6_78_72)] p-5 text-white shadow-card"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5" />
        <h2 className="text-title3">Ask FinanceBro</h2>
      </div>
      <p className="mt-2 max-w-sm text-body text-white/80">
        Check a purchase before you make it. It weighs your balance against the bills still due this month.
      </p>
      <span className="mt-5 flex items-center justify-between rounded-xl bg-white/15 px-4 py-3 text-body">
        “{ASK_PROMPT}”
        <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform duration-300 ease-spring group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
