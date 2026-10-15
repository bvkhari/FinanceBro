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
  FinancialProfile,
  AppNotification,
  Debt,
  DebtDetailsUpdate,
  DebtFrequency,
  NewDebtInput,
} from "./types";
import {
  ProfileData,
  fetchProfileData,
  subscribeToProfile,
  createDebt,
  updateDebtDetails,
  updateInstalment,
  cancelInstalment,
  addInstalments,
  rescheduleDebt,
  recordDebtPayment,
  PaymentResult,
} from "./db";
import type { ScheduledInstalment } from "./debt/schedule";
import { buildPayments, countdown, daysBetween } from "./debt/payments";
import { CashFlow, cashFlow, netCash } from "./cashflow";
import { todayISO, formatRM, formatDateShort } from "./utils";

// ============================================================
// FINANCE CONTEXT — Centralized state management
// ============================================================
// Supabase is the single source of truth. The app tracks one
// personal profile and its BNPL (PayLater) debts. Writes go to
// Supabase and the profile is re-fetched. A Realtime subscription
// re-fetches when anything else (e.g. the agent) changes the data.
// ============================================================

interface FinanceContextValue {
  /** Always "individual": the app has a single personal profile. */
  mode: AppMode;
  profile: FinancialProfile;
  /** Today's cash balance. Only used to show whether upcoming instalments are covered. */
  balance: number;

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
  // Schedule edits. Paid and partly paid instalments are never changed.
  editInstalment: (instalmentId: string, dueDate: string, amount: number) => Promise<void>;
  cancelInstalment: (instalmentId: string) => Promise<void>;
  addInstalments: (debtId: string, schedule: ScheduledInstalment[]) => Promise<number>;
  rescheduleDebt: (debtId: string, frequency: DebtFrequency, repaymentAmount: number | undefined, schedule: ScheduledInstalment[]) => Promise<number>;

  /** Cash now and the projection to month end after PayLater instalments due. */
  cashFlow: CashFlow;

  // Notifications
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;

  // Reload everything from Supabase (`npm run seed` resets the data itself)
  resetData: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

/** Today's balance for a loaded profile: opening balance + every transaction. */
function balanceOf(d?: ProfileData): number {
  if (!d) return 0;
  return (Math.round(d.profile.startingBalance * 100) + Math.round(netCash(d.transactions) * 100)) / 100;
}

const mode: AppMode = "individual";

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ProfileData | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setError(null);
    try {
      setCurrent(await fetchProfileData());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const profileId = current?.profile.id;

  // Live updates: re-fetch whenever the profile's rows change.
  useEffect(() => {
    if (!profileId) return;
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = subscribeToProfile(profileId, () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [profileId, reload]);

  const debts = useMemo(() => current?.debts ?? [], [current]);
  const balance = useMemo(() => balanceOf(current), [current]);

  // === Service-layer functions (Supabase) ===

  /** Runs a write, then re-fetches. Rethrows so the calling form can show the error. */
  const writeOrThrow = useCallback(
    async <T,>(fn: (profileId: string) => Promise<T>): Promise<T> => {
      if (!profileId) throw new Error("No active profile");
      try {
        return await fn(profileId);
      } finally {
        reload();
      }
    },
    [profileId, reload]
  );

  const addDebt = useCallback(
    (input: NewDebtInput, schedule: ScheduledInstalment[]) => writeOrThrow((pid) => createDebt(pid, input, schedule)),
    [writeOrThrow]
  );

  const updateDebt = useCallback(
    (id: string, details: DebtDetailsUpdate) => writeOrThrow((pid) => updateDebtDetails(pid, id, details)),
    [writeOrThrow]
  );

  const editInstalment = useCallback(
    (id: string, dueDate: string, amount: number) => writeOrThrow(() => updateInstalment(id, dueDate, amount)),
    [writeOrThrow]
  );
  const cancelInstalmentAction = useCallback((id: string) => writeOrThrow(() => cancelInstalment(id)), [writeOrThrow]);
  const addInstalmentsAction = useCallback(
    (debtId: string, schedule: ScheduledInstalment[]) => writeOrThrow(() => addInstalments(debtId, schedule)),
    [writeOrThrow]
  );
  const rescheduleDebtAction = useCallback(
    (debtId: string, frequency: DebtFrequency, repaymentAmount: number | undefined, schedule: ScheduledInstalment[]) =>
      writeOrThrow(() => rescheduleDebt(debtId, frequency, repaymentAmount, schedule)),
    [writeOrThrow]
  );

  const recordPayment = useCallback(
    (p: Parameters<typeof recordDebtPayment>[0]) => writeOrThrow(() => recordDebtPayment(p)),
    [writeOrThrow]
  );

  const profile: FinancialProfile = current?.profile ?? {
    id: "",
    mode,
    displayName: "",
    accountType: "",
    currency: "RM",
    startingBalance: 0,
    createdAt: "",
  };

  // === Cash flow (see lib/cashflow.ts for the rules) ===
  const today = todayISO();
  const payments = useMemo(() => buildPayments(debts, [], today), [debts, today]);
  const cash: CashFlow = useMemo(
    () => cashFlow({ transactions: current?.transactions ?? [], balance, payments, incomeSchedule: current?.incomeSchedule ?? [], today }),
    [current, balance, payments, today]
  );

  // === Notifications (derived from the data) ===
  const notifications: AppNotification[] = useMemo(() => {
    // In-app reminders for PayLater instalments: overdue, or due within 3 days.
    const list: Omit<AppNotification, "read">[] = [];
    for (const p of payments) {
      if (p.remaining <= 0) continue;
      const days = daysBetween(today, p.dueDate);
      if (p.status !== "overdue" && days > 3) continue;
      const overdue = p.status === "overdue";
      list.push({
        id: `${overdue ? "overdue" : "due"}-${p.key}`,
        title: overdue ? "Overdue instalment" : "Instalment due soon",
        message: `${p.payee}: ${formatRM(p.remaining)}, ${countdown(p.dueDate, today, p.status).toLowerCase()} (${formatDateShort(p.dueDate)}).`,
        type: overdue ? "warning" : "info",
        timestamp: p.dueDate,
      });
    }
    return list.map((n) => ({ ...n, read: readIds.has(n.id) }));
  }, [payments, today, readIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markNotificationRead = useCallback((id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
  }, []);

  const resetData = useCallback(() => {
    setReadIds(new Set());
    reload();
  }, [reload]);

  const value: FinanceContextValue = {
    mode,
    profile,
    balance,
    debts,
    addDebt,
    updateDebt,
    recordPayment,
    editInstalment,
    cancelInstalment: cancelInstalmentAction,
    addInstalments: addInstalmentsAction,
    rescheduleDebt: rescheduleDebtAction,
    cashFlow: cash,
    notifications,
    unreadCount,
    markNotificationRead,
    resetData,
  };

  if (!current) {
    return (
      <FinanceContext.Provider value={value}>
        <div className="flex h-screen items-center justify-center bg-canvas px-6">
          {error ? (
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <p className="text-headline text-label">Couldn&apos;t load your data</p>
              <p className="text-subhead text-label-2">{error}</p>
              <button
                onClick={reload}
                className="press mt-1 h-9 rounded-full bg-accent px-4 text-subhead font-semibold text-white"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-[2.5px] border-gray/20 border-t-label-2" />
              <p className="text-subhead text-label-2">Loading</p>
            </div>
          )}
        </div>
      </FinanceContext.Provider>
    );
  }

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error("useFinance must be used within FinanceProvider");
  }
  return ctx;
}
