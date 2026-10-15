"use client";

import { useFinance } from "@/lib/FinanceContext";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreditCard, Plus, ChevronRight, Sparkles, ArrowUpRight, FileText } from "lucide-react";
import { useDebtView } from "@/lib/debt/useDebtView";
import type { CashFlow } from "@/lib/cashflow";
import { addDays, debtBreakdown, dueWithin, groupByCreditor, totalDue } from "@/lib/debt/payments";
import { CreditorGroups } from "@/components/debt/CreditorGroups";
import { Modal } from "@/components/ui/Modal";
import { formatRM, formatDateShort } from "@/lib/utils";
import { useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const { profile, cashFlow } = useFinance();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <PageHeader
        title="Dashboard"
        subtitle={`Hi ${profile.displayName.split(" ")[0]}. Here's everything you owe on PayLater.`}
      />
      <DebtWorkspace f={cashFlow} />
    </div>
  );
}

// ------------------------------------------------------------
// PayLater dashboard: what is owed vs what is due, and who to pay next
// ------------------------------------------------------------

function DebtWorkspace({ f }: { f: CashFlow }) {
  const { today, debts, payments, overview: o } = useDebtView();
  const [sheet, setSheet] = useState<7 | 30 | null>(null);
  const due30 = dueWithin(payments, 30, today);
  const groups30 = groupByCreditor(due30, debts);
  const overdue = totalDue(due30.filter((p) => p.status === "overdue"));
  const due7 = totalDue(dueWithin(payments, 7, today));
  const total30 = totalDue(due30);
  const dueSharePct = o.totalOutstanding > 0 ? Math.min(100, (total30 / o.totalOutstanding) * 100) : 0;
  const monthEnd = formatDateShort(o.monthEnd);
  const sheetItems = sheet ? dueWithin(payments, sheet, today) : [];
  const providers = debtBreakdown(debts, payments, "outstanding", today);

  return (
    <>
    <div className="animate-rise space-y-8">
      {/* What has to go out in the next 30 days across every PayLater app. Tap for the list by provider. */}
      <section className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <button type="button" onClick={() => setSheet(30)} className="press group flex w-full items-end justify-between gap-4 p-5 text-left">
            <div className="min-w-0">
              <p className="text-subhead text-label-2">To pay in the next 30 days</p>
              <p className="tabular mt-1 text-large-title text-label">{formatRM(total30)}</p>
              <p className="mt-1 truncate text-subhead text-label-2">
                {due30.length === 0
                  ? "Nothing due. Nice."
                  : `${due30.length} instalment${due30.length === 1 ? "" : "s"} · ${groups30.length} provider${groups30.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <ChevronRight className="mb-1 h-5 w-5 shrink-0 text-label-3 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
          </button>

          {/* Everything still owed, not just what is due: the bar shows how much of it falls due in the next 30 days. */}
          <Link
            href="/payments"
            className="press group flex items-end justify-between gap-4 p-5 shadow-[inset_0_0.5px_0_var(--separator)] hover:bg-gray/8 sm:shadow-[inset_0.5px_0_0_var(--separator)]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-subhead text-label-2">Total owed on PayLater</p>
              <p className="tabular mt-1 text-large-title text-label">{formatRM(o.totalOutstanding)}</p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray/16" aria-hidden>
                <div className="h-full rounded-full bg-warning" style={{ width: `${dueSharePct}%` }} />
              </div>
              <p className="mt-1.5 truncate text-subhead text-label-2">
                {o.activeDebts} active plan{o.activeDebts === 1 ? "" : "s"} · {formatRM(total30)} due in 30 days
              </p>
            </div>
            <ChevronRight className="mb-1 h-5 w-5 shrink-0 text-label-3 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 shadow-[inset_0_0.5px_0_var(--separator)]">
          <button type="button" onClick={() => setSheet(7)} className="press px-5 py-3.5 text-left hover:bg-gray/8">
            <p className="text-footnote text-label-2">Next 7 days</p>
            <p className="tabular mt-0.5 text-headline text-label">{formatRM(due7)}</p>
          </button>
          <button type="button" onClick={() => setSheet(30)} className="press px-5 py-3.5 text-left shadow-[inset_0.5px_0_0_var(--separator)] hover:bg-gray/8">
            <p className="text-footnote text-label-2">Overdue</p>
            <p className={`tabular mt-0.5 text-headline ${overdue > 0 ? "text-negative" : "text-label"}`}>{formatRM(overdue)}</p>
          </button>
        </div>
      </section>

      <QuickActions />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:items-start lg:gap-4">
        <section className="lg:col-span-3">
          <header className="mb-2 flex min-h-8 items-center justify-between gap-3 px-1">
            <h2 className="text-title3 text-label">Pay first</h2>
            <SeeAll href="/payments" />
          </header>
          {groups30.length === 0 ? (
            <p className="rounded-2xl bg-surface py-10 text-center text-subhead text-label-2 shadow-card">Nothing to pay. Nice.</p>
          ) : (
            <CreditorGroups groups={groups30.slice(0, 3)} today={today} />
          )}
        </section>

        <div className="space-y-4 lg:col-span-2">
          <Card title={`Can you cover it by ${monthEnd}?`} flush>
            <dl className="grouped px-4">
              <div className="flex justify-between py-3">
                <dt className="text-body text-label-2">Cash now</dt>
                <dd className="tabular text-body">{formatRM(f.availableCash)}</dd>
              </div>
              {f.expectedIncomeConfirmed > 0 && (
                <div className="flex justify-between py-3">
                  <dt className="text-body text-label-2">Expected income</dt>
                  <dd className="tabular text-body">+{formatRM(f.expectedIncomeConfirmed)}</dd>
                </div>
              )}
              <div className="flex justify-between py-3">
                <dt className="text-body text-label-2">Instalments due</dt>
                <dd className="tabular text-body">−{formatRM(f.debtRepaymentsDue)}</dd>
              </div>
              <div className="flex items-baseline justify-between py-3.5">
                <dt className="text-headline">Left over</dt>
                <dd className={`tabular text-title2 ${f.projectedCash < 0 ? "text-negative" : "text-label"}`}>
                  {formatRM(f.projectedCash)}
                </dd>
              </div>
            </dl>
            <p className="px-4 pb-4 text-footnote text-label-2 shadow-[inset_0_0.5px_0_var(--separator)] pt-3">
              Counts only instalments due by {monthEnd} (overdue included), never the whole amount owed.
              {f.expectedIncomeUnconfirmed > 0 && ` Unconfirmed income of ${formatRM(f.expectedIncomeUnconfirmed)} isn't included.`}
            </p>
          </Card>

          <Card title="Owed by provider" flush>
            {providers.length === 0 ? (
              <p className="px-4 py-8 text-center text-subhead text-label-2">No active PayLater plans.</p>
            ) : (
              <ul className="grouped px-4">
                {providers.map((p) => (
                  <li key={p.name} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-body text-label">{p.name}</span>
                      <span className="tabular text-body text-label">{formatRM(p.amount)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray/16" aria-hidden>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(p.amount / o.totalOutstanding) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <AskCard />
    </div>

    <Modal isOpen={sheet !== null} onClose={() => setSheet(null)} title={`Next ${sheet ?? 30} days`} size="md">
      <p className="mb-4 text-subhead text-label-2">
        <span className="tabular text-title2 text-label">{formatRM(totalDue(sheetItems))}</span> to pay by{" "}
        {formatDateShort(addDays(today, sheet ?? 30))}, overdue included. Pay from the top.
      </p>
      {sheetItems.length === 0 ? (
        <p className="py-8 text-center text-subhead text-label-2">Nothing due.</p>
      ) : (
        <CreditorGroups groups={groupByCreditor(sheetItems, debts)} today={today} openFirst />
      )}
      <Link
        href={`/payments?range=${sheet ?? 30}`}
        className="press mt-4 flex h-11 items-center justify-center rounded-xl bg-accent text-headline text-white"
      >
        Record a payment
      </Link>
    </Modal>
    </>
  );
}

const QUICK = [
  { href: "/payments", label: "Pay", icon: CreditCard },
  { href: "/payments?add=debt", label: "Add PayLater", icon: Plus },
  { href: "/reports", label: "Schedule", icon: FileText },
  { href: "/financebro-ai", label: "Ask AI", icon: Sparkles },
];

// Shortcut tiles: the four things people come here to do.
function QuickActions() {
  const tile = "press flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface py-3.5 shadow-card hover:bg-gray/7";
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-4 gap-3">
      {QUICK.map(({ href, label, icon: Icon }) => (
        <Link key={label} href={href} className={tile}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray/12 text-label">
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <span className="text-footnote font-medium text-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="press flex items-center gap-0.5 rounded-full px-2 py-1 text-subhead text-accent-text">
      See all
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}

const ASK_PROMPT = "Bro, can I take another PayLater plan of RM300?";

function AskCard() {
  return (
    <Link
      href={`/financebro-ai?q=${encodeURIComponent(ASK_PROMPT)}`}
      className="press group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[rgb(10_124_114)] to-[rgb(6_78_72)] p-5 text-white shadow-card"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5" />
        <h2 className="text-title3">Ask FinanceBro</h2>
      </div>
      <p className="mt-2 max-w-sm text-body text-white/80">
        Check a new PayLater plan before you tap &quot;Pay later&quot;. It weighs your cash against the instalments you already owe.
      </p>
      <span className="mt-5 flex items-center justify-between rounded-xl bg-white/15 px-4 py-3 text-body">
        “{ASK_PROMPT}”
        <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform duration-300 ease-spring group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
