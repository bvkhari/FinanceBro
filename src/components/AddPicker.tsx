"use client";

import Link from "next/link";
import { ChevronRight, CreditCard, Receipt, ShoppingBag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export type AddKind = "expense" | "bill" | "debt";

const KINDS: { kind: AddKind; label: string; hint: string; icon: typeof Receipt; href: string; tone: string }[] = [
  { kind: "expense", label: "Expense", hint: "Something you've already paid for", icon: ShoppingBag, href: "/transactions?new=1", tone: "bg-negative/12 text-negative" },
  { kind: "bill", label: "Bill", hint: "Rent, phone, subscriptions", icon: Receipt, href: "/payments?add=bill", tone: "bg-info/12 text-info" },
  { kind: "debt", label: "Debt", hint: "BNPL, card, loan", icon: CreditCard, href: "/payments?add=debt", tone: "bg-warning/12 text-warning" },
];

/**
 * One Add button for everything: pick a type, get that type's form.
 * With `onPick` the choice stays on the page; without it, each row links
 * to the page that owns the form.
 */
export function AddPicker({ isOpen, onClose, onPick }: { isOpen: boolean; onClose: () => void; onPick?: (kind: AddKind) => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="What are you adding?" size="sm">
      <ul className="grouped-inset -mx-1 overflow-hidden rounded-2xl bg-surface" style={{ ["--inset" as string]: "4rem" }}>
        {KINDS.map(({ kind, label, hint, icon: Icon, href, tone }) => {
          const body = (
            <>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-headline text-label">{label}</span>
                <span className="block truncate text-footnote text-label-2">{hint}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-label-3" />
            </>
          );
          const cls = "row-press flex w-full items-center gap-3 px-4 py-3 text-left";
          return (
            <li key={kind}>
              {onPick && kind !== "expense" ? (
                <button type="button" className={cls} onClick={() => onPick(kind)}>
                  {body}
                </button>
              ) : (
                <Link href={href} className={cls} onClick={onClose}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
