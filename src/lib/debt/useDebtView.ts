"use client";

import { useMemo } from "react";
import { useFinance } from "../FinanceContext";
import { todayISO } from "../utils";
import { buildPayments, debtOverview } from "./payments";

/**
 * Debts, payments and dashboard totals for the current debt scope:
 * the active profile, or both profiles combined.
 */
export function useDebtView() {
  const { mode, debtScope, debts, commitments, allDebts, allCommitments, balances } = useFinance();
  const combined = debtScope === "combined";
  const today = todayISO();

  const scopeDebts = combined ? allDebts : debts;
  const scopeBills = combined ? allCommitments : commitments;
  const balance = combined
    ? (Math.round(balances.individual * 100) + Math.round(balances.business * 100)) / 100
    : balances[mode];

  const payments = useMemo(() => buildPayments(scopeDebts, scopeBills, today), [scopeDebts, scopeBills, today]);
  const overview = useMemo(() => debtOverview(scopeDebts, payments, balance, today), [scopeDebts, payments, balance, today]);

  return { combined, today, debts: scopeDebts, payments, overview };
}
