"use client";

import { useFinance } from "@/lib/FinanceContext";
import { Segmented } from "@/components/ui/Segmented";

type Scope = "individual" | "business" | "combined";

/** Personal / Business / Combined. Picking a profile also switches the app's profile. */
export function DebtScopeControl({ className = "" }: { className?: string }) {
  const { mode, setMode, debtScope, setDebtScope } = useFinance();
  return (
    <Segmented<Scope>
      aria-label="Debt view"
      size="sm"
      className={className}
      value={debtScope === "combined" ? "combined" : mode}
      onChange={(v) => (v === "combined" ? setDebtScope("combined") : setMode(v))}
      options={[
        { value: "individual", label: "Personal" },
        { value: "business", label: "Business" },
        { value: "combined", label: "Combined" },
      ]}
    />
  );
}

/** Small tag showing which profile a record belongs to (used in the combined view). */
export function ProfileTag({ mode }: { mode: "individual" | "business" }) {
  return (
    <span className="rounded-full bg-info/12 px-2 py-0.5 text-caption font-medium text-info">
      {mode === "business" ? "Business" : "Personal"}
    </span>
  );
}
