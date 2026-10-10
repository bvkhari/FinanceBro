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
} from "./types";
import {
  getInitialData,
  NOTIFICATIONS,
  INDIVIDUAL_PROFILE,
  BUSINESS_PROFILE,
} from "./mockData";

// ============================================================
// FINANCE CONTEXT — Centralized state management
// ============================================================
// This is the single source of truth for all financial data.
// All pages consume this context — no hardcoded numbers.
//
// The service-layer functions (getTransactions, addTransaction,
// etc.) below simulate API calls using localStorage.
// Backend integration: replace the function bodies with
// real fetch() calls. The interface stays the same.
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

  // Computed values
  summary: FinancialSummary;
  budget: Budget;
  categoryBreakdown: CategoryBreakdown[];
  incomeExpenseData: IncomeExpenseData[];

  // Notifications
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;

  // Reset
  resetData: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const STORAGE_KEY = "financebro-ai-data-v1";

interface StoredData {
  individual: {
    transactions: Transaction[];
    commitments: FinancialCommitment[];
  };
  business: {
    transactions: Transaction[];
    commitments: FinancialCommitment[];
  };
  mode: AppMode;
}

function loadStoredData(): StoredData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredData;
  } catch {
    return null;
  }
}

function saveStoredData(data: StoredData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function getInitialStoredData(): StoredData {
  const stored = loadStoredData();
  if (stored) return stored;

  const indData = getInitialData("individual");
  const bizData = getInitialData("business");

  return {
    individual: {
      transactions: indData.transactions,
      commitments: indData.commitments,
    },
    business: {
      transactions: bizData.transactions,
      commitments: bizData.commitments,
    },
    mode: "individual",
  };
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<AppMode>("individual");
  const [individualTransactions, setIndividualTransactions] = useState<Transaction[]>([]);
  const [businessTransactions, setBusinessTransactions] = useState<Transaction[]>([]);
  const [individualCommitments, setIndividualCommitments] = useState<FinancialCommitment[]>([]);
  const [businessCommitments, setBusinessCommitments] = useState<FinancialCommitment[]>([]);
  const [notifList, setNotifList] = useState<AppNotification[]>(NOTIFICATIONS);

  useEffect(() => {
    const data = getInitialStoredData();
    setMode(data.mode);
    setIndividualTransactions(data.individual.transactions);
    setBusinessTransactions(data.business.transactions);
    setIndividualCommitments(data.individual.commitments);
    setBusinessCommitments(data.business.commitments);
    setMounted(true);
  }, []);

  // Persist to localStorage whenever data changes
  useEffect(() => {
    if (!mounted) return;
    saveStoredData({
      individual: {
        transactions: individualTransactions,
        commitments: individualCommitments,
      },
      business: {
        transactions: businessTransactions,
        commitments: businessCommitments,
      },
      mode,
    });
  }, [mounted, mode, individualTransactions, businessTransactions, individualCommitments, businessCommitments]);

  const profile = mode === "individual" ? INDIVIDUAL_PROFILE : BUSINESS_PROFILE;

  const transactions = mode === "individual" ? individualTransactions : businessTransactions;
  const commitments = mode === "individual" ? individualCommitments : businessCommitments;

  // === Service-layer functions (simulated API) ===

  const addTransaction = useCallback(
    (t: Omit<Transaction, "id" | "createdAt" | "mode">) => {
      const newT: Transaction = {
        ...t,
        id: `t-${mode}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        mode,
      };
      if (mode === "individual") {
        setIndividualTransactions((prev) => [newT, ...prev]);
      } else {
        setBusinessTransactions((prev) => [newT, ...prev]);
      }
    },
    [mode]
  );

  const updateTransaction = useCallback(
    (id: string, updates: Partial<Transaction>) => {
      if (mode === "individual") {
        setIndividualTransactions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
        );
      } else {
        setBusinessTransactions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
        );
      }
    },
    [mode]
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      if (mode === "individual") {
        setIndividualTransactions((prev) => prev.filter((t) => t.id !== id));
      } else {
        setBusinessTransactions((prev) => prev.filter((t) => t.id !== id));
      }
    },
    [mode]
  );

  const addCommitment = useCallback(
    (c: Omit<FinancialCommitment, "id" | "createdAt" | "mode">) => {
      const newC: FinancialCommitment = {
        ...c,
        id: `c-${mode}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        mode,
      };
      if (mode === "individual") {
        setIndividualCommitments((prev) => [...prev, newC]);
      } else {
        setBusinessCommitments((prev) => [...prev, newC]);
      }
    },
    [mode]
  );

  const updateCommitment = useCallback(
    (id: string, updates: Partial<FinancialCommitment>) => {
      if (mode === "individual") {
        setIndividualCommitments((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
        );
      } else {
        setBusinessCommitments((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
        );
      }
    },
    [mode]
  );

  const markCommitmentPaid = useCallback(
    (id: string) => {
      // Mark commitment as paid
      const commitment = commitments.find((c) => c.id === id);
      if (!commitment) return;

      // Create a linked transaction for the payment
      const paidTransaction: Transaction = {
        id: `t-${mode}-commit-${id}`,
        mode,
        name: commitment.name,
        amount: commitment.amount,
        type: "expense",
        category: commitment.category,
        date: new Date().toISOString().split("T")[0],
        description: `Payment for ${commitment.name}`,
        createdAt: new Date().toISOString(),
      };

      if (mode === "individual") {
        setIndividualTransactions((prev) => [paidTransaction, ...prev]);
        setIndividualCommitments((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, status: "paid" as const, paidTransactionId: paidTransaction.id }
              : c
          )
        );
      } else {
        setBusinessTransactions((prev) => [paidTransaction, ...prev]);
        setBusinessCommitments((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, status: "paid" as const, paidTransactionId: paidTransaction.id }
              : c
          )
        );
      }
    },
    [mode, commitments]
  );

  // === Computed financial summary ===
  const summary: FinancialSummary = useMemo(() => {
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const upcomingCommitments = commitments
      .filter((c) => c.status !== "paid")
      .reduce((sum, c) => sum + c.amount, 0);

    const currentBalance = profile.startingBalance + totalIncome - totalExpenses;

    // Budget remaining = monthly budget minus expenses
    // (only count expenses that are NOT linked to commitments, to avoid double-counting)
    const nonCommitmentExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const budgetRemaining = Math.max(0, profile.monthlyBudget - nonCommitmentExpenses);

    // Projected remaining = current balance minus upcoming commitments
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
  }, [transactions, commitments, profile, mode]);

  // === Budget for weekly/monthly ===
  const budget: Budget = useMemo(() => {
    const expenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyBudget = profile.monthlyBudget;
    const weeklyBudget = monthlyBudget / 4.33; // average weeks per month

    return {
      mode,
      period: "monthly",
      totalBudget: monthlyBudget,
      spent: expenses,
      remaining: Math.max(0, monthlyBudget - expenses),
      percentageUsed: monthlyBudget > 0 ? Math.round((expenses / monthlyBudget) * 100) : 0,
    };
  }, [transactions, profile, mode]);

  // === Category breakdown for charts ===
  const categoryBreakdown: CategoryBreakdown[] = useMemo(() => {
    const expenseTransactions = transactions.filter((t) => t.type === "expense");
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
  }, [transactions]);

  // === Income vs Expense data for charts ===
  const incomeExpenseData: IncomeExpenseData[] = useMemo(() => {
    // Group by date
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
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
  }, [transactions]);

  // === Notifications ===
  const unreadCount = notifList.filter((n) => !n.read).length;

  const markNotificationRead = useCallback((id: string) => {
    setNotifList((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  // === Reset data ===
  const resetData = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    const indData = getInitialData("individual");
    const bizData = getInitialData("business");
    setIndividualTransactions(indData.transactions);
    setBusinessTransactions(bizData.transactions);
    setIndividualCommitments(indData.commitments);
    setBusinessCommitments(bizData.commitments);
    setMode("individual");
    setNotifList(NOTIFICATIONS);
  }, []);

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
    summary,
    budget,
    categoryBreakdown,
    incomeExpenseData,
    notifications: notifList,
    unreadCount,
    markNotificationRead,
    resetData,
  };

  if (!mounted) {
    return (
      <FinanceContext.Provider value={value}>
        <div className="flex h-screen items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy-200 border-t-navy-800" />
            <p className="text-sm text-slate-500">Loading FinanceBro AI...</p>
          </div>
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
    Rent: "#ef4444",
    Internet: "#6366f1",
    Utilities: "#14b8a6",
    Instalments: "#f97316",
    Allowance: "#10b981",
    Salary: "#059669",
    "Part-time income": "#22c55e",
    "Sales Revenue": "#0ea5e9",
    "Service Income": "#06b6d4",
    "Other Business Income": "#6366f1",
    Supplies: "#f59e0b",
    "Operating Expenses": "#ef4444",
    Marketing: "#a855f7",
    "Business Rent": "#dc2626",
    "Supplier Payments": "#f97316",
    "Other Business Bills": "#64748b",
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
