"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatRM } from "@/lib/utils";
import { CreditorGroup, PaymentItem, countdown } from "@/lib/debt/payments";
import { PaymentRows } from "./PaymentRows";

/**
 * Who to pay, one card per creditor, already in priority order
 * (see `groupByCreditor`). Tap a creditor to see each payment.
 * With `onPay`, rows get the record-payment action.
 */
export function CreditorGroups({
  groups,
  today,
  onPay,
  openFirst = false,
}: {
  groups: CreditorGroup[];
  today: string;
  onPay?: (item: PaymentItem) => void;
  openFirst?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(openFirst ? groups[0]?.creditor ?? null : null);

  return (
    <ol className="space-y-3">
      {groups.map((g, idx) => {
        const isOpen = open === g.creditor;
        const first = g.items[0];
        return (
          <li key={g.creditor} className="overflow-hidden rounded-2xl bg-surface shadow-card">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.creditor)}
              className="row-press flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subhead font-semibold ${
                  g.overdue > 0 ? "bg-negative/12 text-negative" : idx === 0 ? "bg-accent/12 text-accent-text" : "bg-gray/12 text-label-2"
                }`}
                aria-label={`Priority ${idx + 1}`}
              >
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-headline text-label">{g.creditor}</span>
                <span className="block truncate text-footnote text-label-2">
                  <span className={g.overdue > 0 ? "font-medium text-negative" : first.dueDate === today ? "font-medium text-warning" : ""}>
                    {g.overdue > 0 ? `${formatRM(g.overdue)} overdue` : countdown(first.dueDate, today, first.status)}
                  </span>
                  {" · "}
                  {g.items.length} payment{g.items.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="tabular shrink-0 text-headline text-label">{formatRM(g.total)}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-label-3 transition-transform duration-300 ease-spring ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="animate-fade shadow-[inset_0_0.5px_0_var(--separator)]">
                <PaymentRows items={g.items} today={today} onPay={onPay} compact={!onPay} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
