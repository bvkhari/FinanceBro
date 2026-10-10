"use client";

import { useFinance } from "@/lib/FinanceContext";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  PiggyBank,
  Target,
  Bot,
  ArrowRight,
  Receipt,
  PieChart as PieChartIcon,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { formatRM, formatDateShort, getRelativeTime, todayISO } from "@/lib/utils";
import {
  AreaChart,
  Area,
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
  Legend,
} from "recharts";
import { useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const {
    mode,
    profile,
    summary,
    budget,
    categoryBreakdown,
    incomeExpenseData,
    transactions,
    commitments,
  } = useFinance();
  const [budgetPeriod, setBudgetPeriod] = useState<"weekly" | "monthly">("monthly");

  const recentTransactions = transactions.slice(0, 5);
  const upcomingCommitments = commitments
    .filter((c) => c.status !== "paid")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 4);

  // Weekly budget calculation
  const weeklySpent = budget.spent / 4.33;
  const weeklyBudget = profile.monthlyBudget / 4.33;
  const weeklyRemaining = Math.max(0, weeklyBudget - weeklySpent);
  const weeklyPercent = weeklyBudget > 0 ? Math.round((weeklySpent / weeklyBudget) * 100) : 0;

  const displayBudget = budgetPeriod === "weekly"
    ? { total: weeklyBudget, spent: weeklySpent, remaining: weeklyRemaining, percent: weeklyPercent }
    : { total: budget.totalBudget, spent: budget.spent, remaining: budget.remaining, percent: budget.percentageUsed };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Greeting */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">
            Hey, {profile.displayName.split(" ")[0]}! 👋
          </h2>
          <p className="text-sm text-slate-500">
            Here's your {mode === "individual" ? "personal" : "business"} financial overview
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-xs font-medium text-slate-400">Budget view</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button
              onClick={() => setBudgetPeriod("weekly")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                budgetPeriod === "weekly" ? "bg-white text-navy-900 shadow-sm" : "text-slate-500"
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setBudgetPeriod("monthly")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                budgetPeriod === "monthly" ? "bg-white text-navy-900 shadow-sm" : "text-slate-500"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>
      </div>

      {/* Main Financial Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Current Balance"
          value={summary.currentBalance}
          icon={Wallet}
          variant="navy"
          subtitle="Total available funds"
        />
        <StatCard
          label="Total Monthly Income"
          value={summary.totalMonthlyIncome}
          icon={TrendingUp}
          variant="income"
          subtitle={`This month's earnings`}
        />
        <StatCard
          label="Total Monthly Expenses"
          value={summary.totalMonthlyExpenses}
          icon={TrendingDown}
          variant="expense"
          subtitle={`Spent this month`}
        />
        <StatCard
          label="Upcoming Commitments"
          value={summary.upcomingCommitments}
          icon={CalendarClock}
          variant="warning"
          subtitle={`${upcomingCommitments.length} pending payments`}
        />
        <StatCard
          label="Budget Remaining"
          value={displayBudget.remaining}
          icon={PiggyBank}
          variant="accent"
          subtitle={`${displayBudget.percent}% of ${budgetPeriod} budget used`}
        />
        <StatCard
          label="Projected Remaining Balance"
          value={summary.projectedRemainingBalance}
          icon={Target}
          variant="default"
          subtitle="After upcoming commitments"
        />
      </div>

      {/* Budget Progress Bar */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50">
              <PiggyBank className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-navy-900">{budgetPeriod === "weekly" ? "Weekly" : "Monthly"} Budget Progress</h3>
              <p className="text-xs text-slate-400">{formatRM(displayBudget.spent)} of {formatRM(displayBudget.total)}</p>
            </div>
          </div>
          <span className={`text-sm font-bold ${displayBudget.percent > 80 ? "text-rose-600" : displayBudget.percent > 60 ? "text-amber-600" : "text-teal-600"}`}>
            {displayBudget.percent}%
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              displayBudget.percent > 80
                ? "bg-gradient-to-r from-rose-400 to-rose-600"
                : displayBudget.percent > 60
                ? "bg-gradient-to-r from-amber-400 to-orange-500"
                : "bg-gradient-to-r from-teal-400 to-teal-600"
            }`}
            style={{ width: `${Math.min(displayBudget.percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Charts row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Income vs Expenses Chart */}
        <Card title="Financial Overview" className="lg:col-span-3" icon={<BarChart3 className="h-4 w-4 text-teal-600" />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeExpenseData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `RM${v}`} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => formatRM(value)}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Category Breakdown */}
        <Card title="Spending Breakdown" className="lg:col-span-2" icon={<PieChartIcon className="h-4 w-4 text-teal-600" />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {categoryBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => formatRM(value)}
                />
                <Legend
                  wrapperStyle={{ fontSize: "10px" }}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Bottom Row: Upcoming Payments + Recent Transactions */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Upcoming Payments */}
        <Card
          title="Upcoming Payments"
          icon={<CalendarClock className="h-4 w-4 text-amber-500" />}
          action={
            <Link href="/commitments">
              <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                View All
              </Button>
            </Link>
          }
        >
          <div className="space-y-2">
            {upcomingCommitments.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No upcoming payments</p>
            ) : (
              upcomingCommitments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition-all"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      c.status === "overdue" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
                    }`}
                  >
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-900">{c.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateShort(c.dueDate)} · {getRelativeTime(c.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-navy-900">{formatRM(c.amount)}</p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        c.status === "overdue"
                          ? "bg-rose-50 text-rose-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {c.status === "overdue" ? "Overdue" : "Upcoming"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Transactions */}
        <Card
          title="Recent Transactions"
          icon={<Receipt className="h-4 w-4 text-teal-600" />}
          action={
            <Link href="/transactions">
              <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                View All
              </Button>
            </Link>
          }
        >
          <div className="space-y-2">
            {recentTransactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No transactions yet</p>
            ) : (
              recentTransactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition-all"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      t.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                    }`}
                  >
                    {t.type === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-navy-900">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {t.category} · {formatDateShort(t.date)}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${t.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                    {t.type === "income" ? "+" : "-"}{formatRM(t.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* AI Shortcut + Reality Check */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* FinanceBro AI Shortcut */}
        <div className="relative overflow-hidden rounded-2xl border border-navy-800 bg-gradient-to-br from-navy-800 to-navy-950 p-6">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-teal-500/10 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-teal-500/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">FinanceBro AI</h3>
                <p className="text-xs text-teal-300">Your agentic financial copilot</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-navy-200">
              Bro, want me to analyze your spending and help you save? Just ask me anything.
            </p>
            <div className="mt-3 rounded-xl bg-navy-800/50 p-3">
              <p className="text-xs text-teal-300">Try asking:</p>
              <p className="mt-1 text-sm text-white">"Bro, can I afford to spend RM300?"</p>
            </div>
            <Link href="/financebro-ai" className="mt-4 block">
              <Button variant="primary" className="w-full" icon={<Sparkles className="h-4 w-4" />}>
                Ask FinanceBro AI
              </Button>
            </Link>
          </div>
        </div>

        {/* Financial Reality Check Preview */}
        <Card title="Financial Reality Check" icon={<Target className="h-4 w-4 text-teal-600" />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="text-sm text-slate-500">Current Balance</span>
              <span className="text-sm font-bold text-navy-900">{formatRM(summary.currentBalance)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
              <span className="text-sm text-amber-700">Upcoming Commitments</span>
              <span className="text-sm font-bold text-amber-900">-{formatRM(summary.upcomingCommitments)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border-2 border-teal-200 bg-teal-50 p-3">
              <span className="text-sm font-semibold text-teal-700">Estimated Remaining</span>
              <span className={`text-lg font-extrabold ${summary.projectedRemainingBalance < 0 ? "text-rose-600" : "text-teal-700"}`}>
                {formatRM(summary.projectedRemainingBalance)}
              </span>
            </div>
            <Link href="/financebro-ai" className="block">
              <Button variant="outline" className="w-full" icon={<Bot className="h-4 w-4" />}>
                Ask FinanceBro AI for analysis
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
