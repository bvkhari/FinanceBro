"use client";

import { useMemo } from "react";
import { useFinance } from "../FinanceContext";
import { todayISO } from "../utils";
import { buildPayments, debtOverview } from "./payments";

/** Debts, payments and dashboard totals for the active profile. */
export function useDebtView() {
  const { mode, debts, commitments, balances } = useFinance();
  const today = todayISO();
  const balance = balances[mode];

  const payments = useMemo(() => buildPayments(debts, commitments, today), [debts, commitments, today]);
  const overview = useMemo(() => debtOverview(debts, payments, balance, today), [debts, payments, balance, today]);

  return { today, debts, payments, overview };
}
