"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  AppMode,
  Transaction,
  FinancialCommitment,
  FinancialProfile,
  FinancialSummary,
  Budget,
  CategoryBreakdown,
  IncomeExpenseData,
  AppNotification,
  Debt,
  DebtDetailsUpdate,
  NewDebtInput,
} from "./types";
import {
  ProfileData,
  fetchProfileData,
  insertTransaction,
  updateTransactionRow,
  deleteTransactionRow,
  insertCommitment,
  updateCommitmentRow,
  subscribeToProfile,
  createDebt,
  updateDebtDetails,
  recordDebtPayment,
  PaymentResult,
} from "./db";
import type { ScheduledInstalment } from "./debt/schedule";
import { daysUntil, todayISO } from "./utils";

// ============================================================
// FINANCE CONTEXT — Centralized state management
// ============================================================
// Supabase is the single source of truth. Both profiles are
// loaded on mount; writes go to Supabase and the affected
// profile is re-fetched. A Realtime subscription re-fetches
// when anything else (e.g. the agent) changes the data.
// ============================================================

interface FinanceContextValue {
  // Mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // Profile
  profile: FinancialProfile;

  // Transactions
  transactions: Transaction[];
  addTransaction: (t: Omit<Transaction, "id" | "createdAt" | "mode">) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  // Commitments
  commitments: FinancialCommitment[];
  addCommitment: (c: Omit<FinancialCommitment, "id" | "createdAt" | "mode">) => void;
  updateCommitment: (id: string, updates: Partial<FinancialCommitment>) => void;
  markCommitmentPaid: (id: string) => void;

  // Debts — these return promises and throw, so forms can show the error
  debts: Debt[];
  addDebt: (input: NewDebtInput, schedule: ScheduledInstalment[]) => Promise<void>;
  updateDebt: (id: string, details: DebtDetailsUpdate) => Promise<void>;
  recordPayment: (p: {
    instalmentId: string;
    amount: number;
    paidDate: string;
    interest: number;
    idempotencyKey: string;
  }) => Promise<PaymentResult>;

  // Computed values
  summary: FinancialSummary;
  budget: Budget;
  categoryBreakdown: CategoryBreakdown[];
  incomeExpenseData: IncomeExpenseData[];

  // Notifications
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;

  // Reload everything from Supabase (`npm run seed` resets the data itself)
  resetData: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const MODE_KEY = "financebro-ai-mode";

function loadMode(): AppMode {
  try {
    return localStorage.getItem(MODE_KEY) === "business" ? "business" : "individual";
  } catch {
    return "individual";
  }
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("individual");
  const [data, setData] = useState<Partial<Record<AppMode, ProfileData>>>({});
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const reload = useCallback(async (m: AppMode) => {
    try {
      const d = await fetchProfileData(m);
      setData((prev) => ({ ...prev, [m]: d }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reloadAll = useCallback(() => {
    setError(null);
    return Promise.all([reload("individual"), reload("business")]);
  }, [reload]);

  useEffect(() => {
    setModeState(loadMode());
    reloadAll();
  }, [reloadAll]);

  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const current = data[mode];
  const profileId = current?.profile.id;

  // Live updates: re-fetch the active profile whenever its rows change.
  useEffect(() => {
    if (!profileId) return;
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = subscribeToProfile(profileId, () => {
      clearTimeout(timer);
      timer = setTimeout(() => reload(mode), 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [profileId, mode, reload]);

  const transactions = useMemo(() => current?.transactions ?? [], [current]);
  const commitments = useMemo(() => current?.commitments ?? [], [current]);
  const debts = useMemo(() => current?.debts ?? [], [current]);

  // === Service-layer functions (Supabase) ===

  /** Runs a write against the active profile, then re-fetches it. */
  const write = useCallback(
    (fn: (profileId: string) => Promise<unknown>) => {
      if (!profileId) return;
      fn(profileId)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => reload(mode));
    },
    [profileId, mode, reload]
  );

  const addTransaction = useCallback(
    (t: Omit<Transaction, "id" | "createdAt" | "mode">) => write((pid) => insertTransaction(pid, mode, t)),
    [write, mode]
  );

  const updateTransaction = useCallback(
    (id: string, updates: Partial<Transaction>) => write((pid) => updateTransactionRow(pid, id, updates)),
    [write]
  );

  const deleteTransaction = useCallback(
    (id: string) => write((pid) => deleteTransactionRow(pid, id)),
    [write]
  );

  const addCommitment = useCallback(
    (c: Omit<FinancialCommitment, "id" | "createdAt" | "mode">) => write((pid) => insertCommitment(pid, mode, c)),
    [write, mode]
  );

  const updateCommitment = useCallback(
    (id: string, updates: Partial<FinancialCommitment>) => write((pid) => updateCommitmentRow(pid, mode, id, updates)),
    [write, mode]
  );

  const markCommitmentPaid = useCallback(
    (id: string) => {
      const commitment = commitments.find((c) => c.id === id);
      if (!commitment) return;
      // Record the payment the user made, then mark the commitment paid. Nothing moves money.
      write(async (pid) => {
        await insertTransaction(pid, mode, {
          name: commitment.name,
          amount: commitment.amount,
          type: "expense",
          category: commitment.category,
          date: todayISO(),
          description: `Payment for ${commitment.name}`,
        });
        await updateCommitmentRow(pid, mode, id, { status: "paid" });
      });
    },
    [write, mode, commitments]
  );

  /** Like `write`, but rethrows so the calling form can show the error. */
  const writeOrThrow = useCallback(
    async <T,>(fn: (profileId: string) => Promise<T>): Promise<T> => {
      if (!profileId) throw new Error("No active profile");
      try {
        return await fn(profileId);
      } finally {
        reload(mode);
      }
    },
    [profileId, mode, reload]
  );

  const addDebt = useCallback(
    (input: NewDebtInput, schedule: ScheduledInstalment[]) => writeOrThrow((pid) => createDebt(pid, input, schedule)),
    [writeOrThrow]
  );

  const updateDebt = useCallback(
    (id: string, details: DebtDetailsUpdate) => writeOrThrow((pid) => updateDebtDetails(pid, id, details)),
    [writeOrThrow]
  );

  const recordPayment = useCallback(
    (p: Parameters<typeof recordDebtPayment>[0]) => writeOrThrow(() => recordDebtPayment(p)),
    [writeOrThrow]
  );

  // Monthly figures cover the current calendar month only.
  const monthTransactions = useMemo(() => {
    const month = todayISO().slice(0, 7);
    return transactions.filter((t) => t.date.startsWith(month));
  }, [transactions]);

  const profile: FinancialProfile = current?.profile ?? {
    id: "",
    mode,
    displayName: "",
    accountType: "",
    currency: "RM",
    startingBalance: 0,
    monthlyBudget: 0,
    createdAt: "",
  };

  // === Computed financial summary ===
  const summary: FinancialSummary = useMemo(() => {
    const sum = (list: Transaction[], type: Transaction["type"]) =>
      list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

    const totalIncome = sum(monthTransactions, "income");
    const totalExpenses = sum(monthTransactions, "expense");

    const upcomingCommitments = commitments
      .filter((c) => c.status !== "paid")
      .reduce((s, c) => s + c.amount, 0);

    const currentBalance = profile.startingBalance + sum(transactions, "income") - sum(transactions, "expense");
    const budgetRemaining = Math.max(0, profile.monthlyBudget - totalExpenses);
    const projectedRemainingBalance = currentBalance - upcomingCommitments;

    return {
      mode,
      currentBalance,
      totalMonthlyIncome: totalIncome,
      totalMonthlyExpenses: totalExpenses,
      upcomingCommitments,
      budgetRemaining,
      projectedRemainingBalance,
    };
  }, [transactions, monthTransactions, commitments, profile.startingBalance, profile.monthlyBudget, mode]);

  // === Budget for weekly/monthly ===
  const budget: Budget = useMemo(() => {
    const expenses = summary.totalMonthlyExpenses;
    const monthlyBudget = profile.monthlyBudget;
    return {
      mode,
      period: "monthly",
      totalBudget: monthlyBudget,
      spent: expenses,
      remaining: Math.max(0, monthlyBudget - expenses),
      percentageUsed: monthlyBudget > 0 ? Math.round((expenses / monthlyBudget) * 100) : 0,
    };
  }, [summary.totalMonthlyExpenses, profile.monthlyBudget, mode]);

  // === Category breakdown for charts ===
  const categoryBreakdown: CategoryBreakdown[] = useMemo(() => {
    const expenseTransactions = monthTransactions.filter((t) => t.type === "expense");
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

    const categoryMap = new Map<string, number>();
    for (const t of expenseTransactions) {
      categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + t.amount);
    }

    return Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        color: getCatColor(category),
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthTransactions]);

  // === Income vs Expense data for charts ===
  const incomeExpenseData: IncomeExpenseData[] = useMemo(() => {
    const sorted = [...monthTransactions].sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map<string, { income: number; expenses: number }>();

    for (const t of sorted) {
      const dateLabel = new Date(t.date).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
      const existing = map.get(dateLabel) || { income: 0, expenses: 0 };
      if (t.type === "income") existing.income += t.amount;
      else existing.expenses += t.amount;
      map.set(dateLabel, existing);
    }

    return Array.from(map.entries()).map(([label, vals]) => ({
      label,
      income: Math.round(vals.income * 100) / 100,
      expenses: Math.round(vals.expenses * 100) / 100,
    }));
  }, [monthTransactions]);

  // === Notifications (derived from the data) ===
  const notifications: AppNotification[] = useMemo(() => {
    const list: Omit<AppNotification, "read">[] = [];
    for (const c of commitments) {
      if (c.status === "paid") continue;
      const days = daysUntil(c.dueDate);
      if (c.status === "overdue" || days < 0) {
        list.push({
          id: `overdue-${c.id}`,
          title: "Overdue Payment",
          message: `${c.name} (RM${c.amount.toFixed(2)}) is overdue.`,
          type: "warning",
          timestamp: c.dueDate,
        });
      } else if (days <= 3) {
        list.push({
          id: `due-${c.id}`,
          title: "Payment Due Soon",
          message: `${c.name} (RM${c.amount.toFixed(2)}) is due ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}.`,
          type: "info",
          timestamp: c.dueDate,
        });
      }
    }
    const uncategorised = transactions.filter((t) => t.category === "Uncategorised").length;
    if (uncategorised > 0) {
      list.push({
        id: "uncategorised",
        title: "Uncategorised Transactions",
        message: `${uncategorised} transaction${uncategorised === 1 ? "" : "s"} need a category.`,
        type: "info",
        timestamp: todayISO(),
      });
    }
    return list.map((n) => ({ ...n, read: readIds.has(n.id) }));
  }, [commitments, transactions, readIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markNotificationRead = useCallback((id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
  }, []);

  const resetData = useCallback(() => {
    setReadIds(new Set());
    reloadAll();
  }, [reloadAll]);

  const value: FinanceContextValue = {
    mode,
    setMode,
    profile,
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    commitments,
    addCommitment,
    updateCommitment,
    markCommitmentPaid,
    debts,
    addDebt,
    updateDebt,
    recordPayment,
    summary,
    budget,
    categoryBreakdown,
    incomeExpenseData,
    notifications,
    unreadCount,
    markNotificationRead,
    resetData,
  };

  if (!current) {
    return (
      <FinanceContext.Provider value={value}>
        <div className="flex h-screen items-center justify-center bg-slate-50">
          {error ? (
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <p className="text-sm font-semibold text-rose-600">Couldn&apos;t load data from Supabase</p>
              <p className="text-xs text-slate-500">{error}</p>
              <button
                onClick={reloadAll}
                className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-700"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy-200 border-t-navy-800" />
              <p className="text-sm text-slate-500">Loading FinanceBro AI...</p>
            </div>
          )}
        </div>
      </FinanceContext.Provider>
    );
  }

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

function getCatColor(category: string): string {
  const colors: Record<string, string> = {
    Food: "#0d9488",
    Transportation: "#3b82f6",
    Shopping: "#a855f7",
    Education: "#f59e0b",
    Entertainment: "#ec4899",
    Subscriptions: "#8b5cf6",
    Rent: "#ef4444",
    Internet: "#6366f1",
    Utilities: "#14b8a6",
    Instalments: "#f97316",
    Allowance: "#10b981",
    Salary: "#059669",
    "Part-time income": "#22c55e",
    "Sales Revenue": "#0ea5e9",
    "Delivery Sales": "#38bdf8",
    "Service Income": "#06b6d4",
    "Other Business Income": "#6366f1",
    Ingredients: "#0d9488",
    Packaging: "#f59e0b",
    Wages: "#3b82f6",
    Supplies: "#f59e0b",
    "Operating Expenses": "#ef4444",
    Marketing: "#a855f7",
    "Business Rent": "#dc2626",
    "Supplier Payments": "#f97316",
    "Other Business Bills": "#64748b",
    Uncategorised: "#94a3b8",
  };
  return colors[category] || "#64748b";
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error("useFinance must be used within FinanceProvider");
  }
  return ctx;
}
