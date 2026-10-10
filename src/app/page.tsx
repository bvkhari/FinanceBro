"use client";

import { useFinance } from "@/lib/FinanceContext";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  Clock,
  CreditCard,
  Landmark,
} from "lucide-react";
import { useDebtView } from "@/lib/debt/useDebtView";
import { countdown } from "@/lib/debt/payments";
import { PaymentRows } from "@/components/debt/PaymentRows";
import { DebtScopeControl } from "@/components/debt/DebtScopeControl";
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
  } = useFinance();
  const [budgetPeriod, setBudgetPeriod] = useState<"weekly" | "monthly">("monthly");
  const [workspace, setWorkspace] = useState<"expenses" | "debt">("expenses");

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
        accessory={
          <Segmented
            aria-label="Workspace"
            className="w-full sm:w-56"
            value={workspace}
            onChange={setWorkspace}
            options={[
              { value: "expenses", label: "Expenses" },
              { value: "debt", label: "Debt" },
            ]}
          />
        }
      />

      {workspace === "expenses" ? (
        <div key="expenses" className="animate-rise space-y-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
            <StatCard label="Balance" value={summary.currentBalance} icon={Wallet} variant="accent" subtitle="Available now" />
            <StatCard label="Income" value={summary.totalMonthlyIncome} icon={TrendingUp} variant="income" subtitle="This month" />
            <StatCard label="Spent" value={summary.totalMonthlyExpenses} icon={TrendingDown} variant="expense" subtitle="This month" />
          </div>

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
        <DebtWorkspace />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Debt dashboard: what is owed vs what is due, and who to pay next
// ------------------------------------------------------------

function DebtWorkspace() {
  const { combined, today, payments, overview: o } = useDebtView();
  const upNext = payments.filter((p) => p.remaining > 0).slice(0, 5);
  const month = new Date(`${today}T00:00:00`).toLocaleDateString("en-MY", { month: "long" });
  const monthEnd = formatDateShort(o.monthEnd);
  const next = o.nextPayment;

  return (
    <div key="debt" className="animate-rise space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="px-1 text-subhead text-label-2">
          <span className="font-semibold text-label">Outstanding debt</span> is everything you still owe.{" "}
          <span className="font-semibold text-label">Repayments due</span> are only the parts scheduled for that period.
        </p>
        <DebtScopeControl className="w-full shrink-0 sm:w-72" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Outstanding debt" value={o.totalOutstanding} icon={Landmark} variant="navy" subtitle="Total still owed" />
        <StatCard label="Due this month" value={o.dueThisMonth} icon={CalendarClock} variant="warning" subtitle={`Repayments in ${month}`} />
        <StatCard label="Due in 7 days" value={o.dueNext7Days} icon={Clock} variant="warning" subtitle="Today to a week from now" />
        <StatCard label="Overdue" value={o.overdue} icon={AlertTriangle} variant="expense" subtitle="Repayments past due" />
        <StatCard label="Active debts" value={o.activeDebts} icon={CreditCard} plain subtitle={combined ? "Personal and business" : "Not yet paid off"} />
        <Link href="/debts" className="press rounded-2xl">
          <StatCard
            label="Next payment"
            value={next ? next.remaining : 0}
            icon={ArrowRight}
            variant="accent"
            subtitle={next ? `${next.payee} · ${formatDateShort(next.dueDate)} · ${countdown(next.dueDate, today, next.status)}` : "Nothing scheduled"}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-4">
        <Card title="Who to pay next" flush action={<SeeAll href="/debts" />}>
          {upNext.length === 0 ? (
            <p className="py-10 text-center text-subhead text-label-2">Nothing to pay. Nice.</p>
          ) : (
            <PaymentRows items={upNext} today={today} combined={combined} compact />
          )}
        </Card>

        <Card title="Available cash" flush>
          <dl className="grouped px-4">
            <div className="flex justify-between py-3">
              <dt className="text-body text-label-2">{combined ? "Balance (both profiles)" : "Balance"}</dt>
              <dd className="tabular text-body">{formatRM(o.balance)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-body text-label-2">Debt repayments due by {monthEnd}</dt>
              <dd className="tabular text-body text-negative">−{formatRM(o.debtDueByMonthEnd)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-body text-label-2">Bills due by {monthEnd}</dt>
              <dd className="tabular text-body text-negative">−{formatRM(o.billsDueByMonthEnd)}</dd>
            </div>
            <div className="flex items-baseline justify-between py-3.5">
              <dt className="text-headline">Left after these</dt>
              <dd className={`tabular text-title2 ${o.availableAfterCommitments < 0 ? "text-negative" : "text-label"}`}>
                {formatRM(o.availableAfterCommitments)}
              </dd>
            </div>
          </dl>
          <p className="px-4 pb-3 text-footnote text-label-2">
            Only payments due by {monthEnd} are subtracted (overdue ones included), not the whole outstanding debt of{" "}
            {formatRM(o.totalOutstanding)}. Income you expect to receive isn&apos;t added.
          </p>
        </Card>
      </div>

      <AskCard />
    </div>
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
