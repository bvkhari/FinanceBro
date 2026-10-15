"use client";

import { useMemo } from "react";
import { useFinance } from "../FinanceContext";
import { todayISO } from "../utils";
import { buildPayments, debtOverview } from "./payments";

/** PayLater debts, their instalments as payments, and the dashboard totals. */
export function useDebtView() {
  const { debts, balance } = useFinance();
  const today = todayISO();

  const payments = useMemo(() => buildPayments(debts, [], today), [debts, today]);
  const overview = useMemo(() => debtOverview(debts, payments, balance, today), [debts, payments, balance, today]);

  return { today, debts, payments, overview };
}
