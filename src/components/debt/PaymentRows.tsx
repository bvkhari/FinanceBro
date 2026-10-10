"use client";

import { CreditCard, Receipt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProfileTag } from "@/components/debt/DebtScopeControl";
import { formatDate, formatRM } from "@/lib/utils";
import { INSTALMENT_STATUS_STYLE } from "@/lib/debt/labels";
import { PaymentItem, countdown } from "@/lib/debt/payments";

const iconTone = {
  overdue: "bg-negative/12 text-negative",
  upcoming: "bg-warning/12 text-warning",
  partial: "bg-info/12 text-info",
  paid: "bg-positive/12 text-positive",
  cancelled: "bg-gray/12 text-label-2",
} as const;

/**
 * One row per payment: who to pay, how much, the exact due date and a
 * countdown. Unpaid rows get an action (record a debt payment / mark a bill paid).
 */
export function PaymentRows({
  items,
  today,
  combined,
  onPay,
  onMarkBillPaid,
  compact = false,
}: {
  items: PaymentItem[];
  today: string;
  combined: boolean;
  onPay?: (item: PaymentItem) => void;
  onMarkBillPaid?: (item: PaymentItem) => void;
  compact?: boolean;
}) {
  return (
    <ul className="grouped-inset">
      {items.map((p) => {
        const status = INSTALMENT_STATUS_STYLE[p.status];
        const unpaid = p.remaining > 0;
        const late = p.status === "overdue";
        const Icon = p.kind === "debt" ? CreditCard : Receipt;
        return (
          <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone[p.status]}`}>
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1 basis-40">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-body text-label">{p.payee}</p>
                {combined && <ProfileTag mode={p.mode} />}
              </div>
              <p className="text-footnote text-label-2">
                <span className={late ? "font-medium text-negative" : unpaid && p.dueDate === today ? "font-medium text-warning" : ""}>
                  {formatDate(p.dueDate)} · {countdown(p.dueDate, today, p.status)}
                </span>
                {!compact && (
                  <>
                    {" · "}
                    {p.category} · {p.frequency}
                    {p.instalmentNo && p.instalmentCount && p.instalmentCount > 1 && <> · {p.instalmentNo} of {p.instalmentCount}</>}
                  </>
                )}
              </p>
              {!compact && p.status === "paid" && p.paidDate && (
                <p className="text-footnote text-label-3">Paid {formatDate(p.paidDate)}</p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="tabular text-body font-medium text-label">
                {formatRM(p.status === "paid" ? p.amountPaid : p.status === "cancelled" ? p.amount : p.remaining)}
              </p>
              {p.status === "partial" ? (
                <p className="tabular text-caption text-info">of {formatRM(p.amount)} · {formatRM(p.amountPaid)} paid</p>
              ) : (
                !compact && (
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-caption font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                )
              )}
            </div>

            {!compact && (
              <div className="shrink-0 text-right empty:hidden max-sm:w-full max-sm:pl-11 max-sm:text-left sm:w-[8.5rem]">
                {unpaid && p.kind === "debt" && onPay && (
                  <Button variant="success" size="sm" onClick={() => onPay(p)}>
                    Record payment
                  </Button>
                )}
                {unpaid && p.kind === "bill" && onMarkBillPaid && (
                  <Button variant="secondary" size="sm" onClick={() => onMarkBillPaid(p)}>
                    Mark paid
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
