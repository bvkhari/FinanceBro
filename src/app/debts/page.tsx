"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  ChevronDown,
  Info,
  Pencil,
  Plus,
} from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, TextArea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { formatDate, formatRM, todayISO } from "@/lib/utils";
import { Debt, DebtInstalment, DebtType } from "@/lib/types";
import {
  DEBT_TYPE_LABELS,
  FREQUENCY_LABELS,
  INSTALMENT_STATUS_STYLE,
  debtTypesFor,
} from "@/lib/debt/labels";
import { PaymentModal, PaymentTarget } from "@/components/debt/PaymentModal";
import { PaymentRows } from "@/components/debt/PaymentRows";
import { DebtScopeControl, ProfileTag } from "@/components/debt/DebtScopeControl";
import { useDebtView } from "@/lib/debt/useDebtView";
import { EditInstalmentModal, ExtendScheduleModal, RescheduleModal } from "@/components/debt/ScheduleModals";
import { ScheduleDraft, ScheduleEditor, draftRepayment, emptyDraft, previewSchedule } from "@/components/debt/ScheduleEditor";
import { spendingCategories } from "@/lib/categories";
import { downloadCsv } from "@/lib/csv";
import { PAYMENT_FILTERS, PaymentFilter, PaymentItem, countdown, extraPaymentScenario, filterPayments, totalDue, totalPaid } from "@/lib/debt/payments";
import { toCents } from "@/lib/debt/schedule";

type View = "active" | "paid_off" | "all";
type Tab = "payments" | "debts";

export default function DebtsPage() {
  const { mode, markCommitmentPaid } = useFinance();
  const { combined, today, debts, payments } = useDebtView();
  const [tab, setTab] = useState<Tab>("payments");
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [view, setView] = useState<View>("active");
  const [sort, setSort] = useState<"due" | "interest">("due");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);
  const [editingInstalment, setEditingInstalment] = useState<{ debt: Debt; instalment: DebtInstalment } | null>(null);
  const [rescheduling, setRescheduling] = useState<Debt | null>(null);
  const [extending, setExtending] = useState<Debt | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const done = (msg: string) => {
    setEditingInstalment(null);
    setRescheduling(null);
    setExtending(null);
    setFlash(msg);
  };

  // Deep links from the dashboard: /debts?tab=debts or /debts?filter=overdue
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("tab") === "debts") setTab("debts");
    const f = q.get("filter");
    if (f && PAYMENT_FILTERS.some((o) => o.value === f)) setFilter(f as PaymentFilter);
  }, []);

  // Messages and open rows belong to one view; clear them when switching.
  useEffect(() => {
    setFlash(null);
    setExpanded(null);
  }, [mode, combined]);

  const visible = useMemo(() => {
    const list = debts.filter((d) => view === "all" || d.status === view);
    const due = (d: Debt) => d.nextInstalment?.dueDate ?? "9999";
    // Highest known rate first; unknown rates go last, so nothing is guessed.
    return list.sort((a, b) =>
      sort === "interest" ? (b.interestRate ?? -1) - (a.interestRate ?? -1) || due(a).localeCompare(due(b)) : due(a).localeCompare(due(b))
    );
  }, [debts, view, sort]);
  const shown = useMemo(() => filterPayments(payments, filter, today), [payments, filter, today]);
  const unpaidCount = shown.filter((p) => p.remaining > 0).length;

  const title = combined ? "All Debts" : mode === "business" ? "Business Debts" : "Personal Debts";

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <PageHeader
        title={title}
        subtitle="Who you need to pay and when, what you still owe, and the payments you've made."
        accessory={
          combined ? undefined : (
            <Button onClick={() => setShowAdd(true)} icon={<Plus className="h-4 w-4" strokeWidth={2.5} />} className="max-sm:w-full">
              Add debt
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Tab>
          aria-label="Section"
          className="w-full sm:w-56"
          value={tab}
          onChange={setTab}
          options={[
            { value: "payments", label: "Payments" },
            { value: "debts", label: "Debts" },
          ]}
        />
        <DebtScopeControl className="w-full sm:w-72" />
      </div>

      {flash && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-2xl bg-positive/12 px-4 py-3 text-subhead text-label">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-positive" />
          <span className="flex-1">{flash}</span>
          <button className="press text-footnote font-semibold text-accent-text" onClick={() => setFlash(null)}>
            Dismiss
          </button>
        </div>
      )}

      {tab === "payments" ? (
        <section aria-label="Upcoming payments">
          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Filter payments">
            {PAYMENT_FILTERS.map((f) => (
              <button
                key={f.value}
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`press shrink-0 rounded-full px-3.5 py-1.5 text-subhead font-medium ${
                  filter === f.value ? "bg-accent text-white" : "bg-gray/12 text-label"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            {filter === "paid" ? (
              <p className="text-subhead text-label-2">
                <span className="tabular text-title3 text-label">{formatRM(totalPaid(shown))}</span> paid · {shown.length} payment{shown.length === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="text-subhead text-label-2">
                <span className={`tabular text-title3 ${filter === "overdue" && totalDue(shown) > 0 ? "text-negative" : "text-label"}`}>
                  {formatRM(totalDue(shown))}
                </span>{" "}
                to pay · {unpaidCount} payment{unpaidCount === 1 ? "" : "s"}
              </p>
            )}
            <div className="flex items-center gap-3">
              {filter !== "paid" && (
                <p className="hidden text-footnote text-label-3 sm:block">Paid and cancelled payments aren&apos;t counted</p>
              )}
              <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} disabled={!shown.length} onClick={() => exportPayments(shown, filter)}>
                CSV
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
            {shown.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-headline">{EMPTY_PAYMENTS[filter]}</p>
              </div>
            ) : (
              <PaymentRows
                items={shown}
                today={today}
                combined={combined}
                onPay={(p) =>
                  setPaying({ payee: p.payee, instalmentId: p.instalmentId!, dueDate: p.dueDate, amount: p.amount, amountPaid: p.amountPaid, remaining: p.remaining })
                }
                onMarkBillPaid={(p) => {
                  markCommitmentPaid(p.commitmentId!);
                  setFlash(`Marked ${p.payee} (${formatRM(p.remaining)}) as paid.`);
                }}
              />
            )}
          </div>
        </section>
      ) : (
        <section aria-label="Debts">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Segmented
            aria-label="Filter debts"
            size="sm"
            className="w-full sm:max-w-[20rem]"
            value={view}
            onChange={setView}
            options={(["active", "paid_off", "all"] as View[]).map((v) => ({
              value: v,
              label: `${{ active: "Active", paid_off: "Paid off", all: "All" }[v]} ${
                v === "all" ? debts.length : debts.filter((d) => d.status === v).length
              }`,
            }))}
          />
          <Segmented
            aria-label="Sort debts"
            size="sm"
            className="w-full sm:w-64"
            value={sort}
            onChange={setSort}
            options={[
              { value: "due", label: "Next due" },
              { value: "interest", label: "Highest interest" },
            ]}
          />
          </div>

          {visible.length > 0 && (
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <p className="text-footnote text-label-2">
                <span className="font-semibold text-label">Owed by type: </span>
                {byType(visible).map(([t, amt]) => `${t} ${formatRM(amt)}`).join(" · ")}
              </p>
              <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportDebts(visible)}>
                CSV
              </Button>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="rounded-2xl bg-surface px-6 py-14 text-center shadow-card">
              <p className="text-headline">{view === "paid_off" ? "Nothing paid off yet" : "No debts here"}</p>
              <p className="mt-1 text-subhead text-label-2">Add a debt to track what you owe and when to pay it.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((debt) => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  combined={combined}
                  expanded={expanded === debt.id}
                  onToggle={() => setExpanded(expanded === debt.id ? null : debt.id)}
                  onEdit={() => setEditing(debt)}
                  onPay={(i) =>
                    setPaying({ payee: debt.name, instalmentId: i.id, dueDate: i.dueDate, amount: i.amount, amountPaid: i.amountPaid, remaining: i.remaining })
                  }
                  onEditInstalment={(i) => setEditingInstalment({ debt, instalment: i })}
                  onReschedule={() => setRescheduling(debt)}
                  onExtend={() => setExtending(debt)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <AddDebtModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSaved={(msg) => setFlash(msg)} />
      <EditDebtModal debt={editing} onClose={() => setEditing(null)} />
      <EditInstalmentModal target={editingInstalment} onClose={() => setEditingInstalment(null)} onDone={done} />
      <RescheduleModal debt={rescheduling} onClose={() => setRescheduling(null)} onDone={done} />
      <ExtendScheduleModal debt={extending} onClose={() => setExtending(null)} onDone={done} />
      <PaymentModal
        target={paying}
        onClose={() => setPaying(null)}
        onPaid={(msg) => {
          setPaying(null);
          setFlash(msg);
        }}
      />
    </div>
  );
}

/** Outstanding per debt type, largest first. */
function byType(debts: Debt[]): [string, number][] {
  const m = new Map<string, number>();
  for (const d of debts) m.set(DEBT_TYPE_LABELS[d.debtType], (m.get(DEBT_TYPE_LABELS[d.debtType]) ?? 0) + Math.round(d.outstandingBalance * 100));
  return [...m].map(([t, c]) => [t, c / 100] as [string, number]).sort((a, b) => b[1] - a[1]);
}

const profileName = (m: Debt["mode"]) => (m === "business" ? "Business" : "Personal");

function exportPayments(items: PaymentItem[], filter: PaymentFilter) {
  downloadCsv(`payments-${filter}-${todayISO()}.csv`, [
    ["Profile", "Pay to", "Category", "Frequency", "Due date", "Amount", "Paid", "Still due", "Paid on", "Status"],
    ...items.map((p) => [
      profileName(p.mode), p.payee, p.category, p.frequency, p.dueDate, p.amount.toFixed(2), p.amountPaid.toFixed(2),
      p.remaining.toFixed(2), p.paidDate, INSTALMENT_STATUS_STYLE[p.status].label,
    ]),
  ]);
}

function exportDebts(debts: Debt[]) {
  downloadCsv(`debts-${todayISO()}.csv`, [
    ["Profile", "Owed to", "Type", "Reference", "Original", "Outstanding", "Repaid", "Repayment", "Frequency", "Interest % p.a.", "Next due", "Next amount", "Status"],
    ...debts.map((d) => [
      profileName(d.mode), d.name, DEBT_TYPE_LABELS[d.debtType], d.referenceNo, d.originalAmount.toFixed(2), d.outstandingBalance.toFixed(2),
      ((Math.round(d.originalAmount * 100) - Math.round(d.outstandingBalance * 100)) / 100).toFixed(2), d.repaymentAmount?.toFixed(2),
      FREQUENCY_LABELS[d.frequency], d.interestRate, d.nextInstalment?.dueDate, d.nextInstalment?.remaining.toFixed(2), d.status.replace("_", " "),
    ]),
  ]);
}

const EMPTY_PAYMENTS: Record<PaymentFilter, string> = {
  all: "No payments yet",
  today: "Nothing due today",
  next7: "Nothing due in the next 7 days",
  month: "Nothing left to pay this month",
  overdue: "Nothing overdue",
  paid: "No payments recorded yet",
};

// ------------------------------------------------------------
// Debt card with its repayment schedule
// ------------------------------------------------------------

function DebtCard({
  debt,
  combined,
  expanded,
  onToggle,
  onEdit,
  onPay,
  onEditInstalment,
  onReschedule,
  onExtend,
}: {
  debt: Debt;
  combined: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPay: (i: DebtInstalment) => void;
  onEditInstalment: (i: DebtInstalment) => void;
  onReschedule: () => void;
  onExtend: () => void;
}) {
  const active = debt.status === "active";
  const regular = ["weekly", "biweekly", "monthly", "yearly"].includes(debt.frequency) && !!debt.repaymentAmount;
  const paidPct = debt.originalAmount > 0 ? Math.round((1 - debt.outstandingBalance / debt.originalAmount) * 100) : 0;
  const next = debt.nextInstalment;
  const paidCount = debt.instalments.filter((i) => i.status === "paid").length;
  const leftCount = debt.instalments.filter((i) => i.remaining > 0).length;

  return (
    <div className={`rounded-2xl bg-surface shadow-card ${next?.status === "overdue" ? "ring-1 ring-inset ring-negative/40" : ""}`}>
      <button onClick={onToggle} className="row-press flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-headline text-label">{debt.name}</h3>
            {combined && <ProfileTag mode={debt.mode} />}
            <span className="rounded-full bg-gray/12 px-2 py-0.5 text-caption font-medium text-label-2">
              {DEBT_TYPE_LABELS[debt.debtType]}
            </span>
            {debt.status === "paid_off" && (
              <span className="rounded-full bg-positive/12 px-2 py-0.5 text-caption font-semibold text-positive">Paid off</span>
            )}
            {debt.status === "cancelled" && (
              <span className="rounded-full bg-gray/12 px-2 py-0.5 text-caption font-semibold text-label-2">Cancelled</span>
            )}
            {debt.isSample && (
              <span
                className="rounded-full ring-1 ring-inset ring-[color:var(--separator)] px-2 py-0.5 text-caption font-medium text-label-2"
                title="Fictional record from the demo seed data"
              >
                Sample
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-footnote text-label-2">
            <span>{FREQUENCY_LABELS[debt.frequency].replace(" (enter each payment)", "")}</span>
            {debt.repaymentAmount !== undefined && <span>{formatRM(debt.repaymentAmount)} per instalment</span>}
            {debt.referenceNo && <span>Ref {debt.referenceNo}</span>}
            {debt.interestRate !== undefined && <span>{debt.interestRate}% p.a.</span>}
          </div>
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray/12">
            <div className="h-full rounded-full bg-accent" style={{ width: `${paidPct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-6 sm:text-right">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-label-3">Outstanding</p>
            <p className="tabular text-headline text-label">{formatRM(debt.outstandingBalance)}</p>
            <p className="text-caption text-label-3">of {formatRM(debt.originalAmount)}</p>
          </div>
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-label-3">Next payment</p>
            {next ? (
              <>
                <p className="text-headline text-label">{formatRM(next.remaining)}</p>
                <p className={`text-caption font-semibold ${next.status === "overdue" ? "text-negative" : "text-label-2"}`}>
                  {formatDate(next.dueDate)} · {countdown(next.dueDate, todayISO(), next.status)}
                </p>
              </>
            ) : (
              <p className="text-headline text-label-3">—</p>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-label-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[color:var(--separator)] px-4 pb-4 pt-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-footnote text-label-2">
              {paidCount} paid · {leftCount} left
              {debt.startDate && <> · started {formatDate(debt.startDate)}</>}
              {debt.endDate && <> · ends {formatDate(debt.endDate)}</>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {active && (
                <Button variant="outline" size="sm" icon={<CalendarClock className="h-3.5 w-3.5" />} onClick={onReschedule}>
                  Reschedule
                </Button>
              )}
              <Button variant="outline" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
                Edit details
              </Button>
            </div>
          </div>
          {debt.unscheduledBalance > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-warning/12 px-3 py-2 text-footnote text-label">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span className="flex-1">{formatRM(debt.unscheduledBalance)} of the outstanding balance has no scheduled payment yet.</span>
              <Button variant="ghost" size="sm" onClick={regular ? onExtend : onReschedule}>
                {regular ? "Add instalments" : "Reschedule"}
              </Button>
            </div>
          )}
          {debt.notes && <p className="mb-3 rounded-xl bg-gray/12 px-3 py-2 text-footnote text-label-2">{debt.notes}</p>}

          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[560px] text-footnote">
              <thead>
                <tr className="text-left text-caption uppercase tracking-wide text-label-3">
                  <th className="py-2 pr-3 font-semibold">Instalment</th>
                  <th className="py-2 pr-3 font-semibold">Due date</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-3 text-right font-semibold">Paid</th>
                  <th className="py-2 pr-3 font-semibold">Paid on</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--separator)]">
                {debt.instalments.map((i, idx) => {
                  const style = INSTALMENT_STATUS_STYLE[i.status];
                  return (
                    <tr key={i.id} className="text-label">
                      <td className="py-2 pr-3 font-medium">
                        {new Date(i.dueDate).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}
                        <span className="ml-1 text-label-3">#{idx + 1}</span>
                      </td>
                      <td className="py-2 pr-3">{formatDate(i.dueDate)}</td>
                      <td className="py-2 pr-3 text-right">{formatRM(i.amount)}</td>
                      <td className="py-2 pr-3 text-right">
                        {i.amountPaid > 0 ? formatRM(i.amountPaid) : "—"}
                        {i.status === "partial" && (
                          <span className="block text-caption text-info">{formatRM(i.remaining)} left</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{i.paidDate ? formatDate(i.paidDate) : "—"}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${style.className}`}>{style.label}</span>
                      </td>
                      <td className="py-2 text-right">
                        {i.remaining > 0 && active && (
                          <span className="inline-flex gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => onEditInstalment(i)} aria-label={`Edit instalment due ${formatDate(i.dueDate)}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="success" size="sm" onClick={() => onPay(i)}>
                              Record payment
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {active && debt.outstandingBalance > 0 && <ExtraPayment debt={debt} />}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// "What if I pay extra?" — a comparison only, nothing is paid
// ------------------------------------------------------------

function ExtraPayment({ debt }: { debt: Debt }) {
  const { mode, cashFlow } = useFinance();
  const [extra, setExtra] = useState<number | null>(null);
  const s = extra ? extraPaymentScenario(debt, extra, todayISO()) : null;
  // Projected cash is known for the active profile only.
  const cashAfter = s && debt.mode === mode ? (Math.round(cashFlow.projectedCash * 100) - Math.round(s.extra * 100)) / 100 : undefined;

  return (
    <div className="mt-3 rounded-xl bg-gray/7 px-3 py-2.5 text-footnote">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label-2">What if you pay extra now?</span>
        {[100, 200].map((n) => (
          <button
            key={n}
            onClick={() => setExtra(extra === n ? null : n)}
            aria-pressed={extra === n}
            className={`press rounded-full px-3 py-1 font-medium ${extra === n ? "bg-accent text-white" : "bg-gray/12 text-label"}`}
          >
            +{formatRM(n, { decimals: 0 })}
          </button>
        ))}
      </div>
      {s && (
        <ul className="mt-2 space-y-0.5 text-label">
          <li>
            Owed drops to <span className="tabular font-semibold">{formatRM(s.outstandingAfter)}</span>.
            {s.instalmentsBefore > 1 && " Your next payments stay the same."}
          </li>
          <li>
            {s.instalmentsAfter < s.instalmentsBefore
              ? `Finish ${s.instalmentsBefore - s.instalmentsAfter} instalment${s.instalmentsBefore - s.instalmentsAfter === 1 ? "" : "s"} sooner: last payment ${s.payoffAfter ? formatDate(s.payoffAfter) : "none left"} instead of ${formatDate(s.payoffBefore!)}.`
              : `Not enough to clear a whole instalment; the last one (${formatDate(s.payoffBefore!)}) gets smaller.`}
          </li>
          <li className="text-label-2">
            {s.interestSavedEstimate !== undefined
              ? `About ${formatRM(s.interestSavedEstimate)} less interest (estimate at ${debt.interestRate}% p.a. on the amount paid early).`
              : "No interest rate on record, so no interest saving is shown."}
          </li>
          {cashAfter !== undefined && (
            <li className={cashAfter < 0 ? "font-medium text-negative" : "text-label-2"}>
              Projected cash on {formatDate(cashFlow.monthEnd)} would be {formatRM(cashAfter)}
              {cashAfter < 0 ? ", so you can't afford it this month." : "."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Add a debt with its schedule
// ------------------------------------------------------------

/** Debt types that usually come from buying something, so the purchase option starts ticked. */
const PURCHASE_TYPES = new Set<DebtType>(["bnpl", "credit_card", "business_credit_card", "supplier_invoice"]);

function AddDebtModal({ isOpen, onClose, onSaved }: { isOpen: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const { mode, addDebt } = useFinance();
  const types = debtTypesFor(mode);

  const [name, setName] = useState("");
  const [debtType, setDebtType] = useState<DebtType>(types[0].value);
  const [original, setOriginal] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft());
  const [interestRate, setInterestRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [recordPurchase, setRecordPurchase] = useState(true);
  const [purchaseCategory, setPurchaseCategory] = useState(spendingCategories(mode)[0]);
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRecordPurchase(PURCHASE_TYPES.has(debtTypesFor(mode)[0].value));
    setPurchaseCategory(spendingCategories(mode)[0]);
    setPurchaseDate(todayISO());
    setName("");
    setDebtType(debtTypesFor(mode)[0].value);
    setOriginal("");
    setOutstanding("");
    setDraft(emptyDraft());
    setInterestRate("");
    setStartDate("");
    setEndDate("");
    setReferenceNo("");
    setNotes("");
    setError(null);
    setSaving(false);
  }, [isOpen, mode]);

  const owed = parseFloat(outstanding || original);

  // The schedule is computed by the same generator the seed and tests use.
  const preview = useMemo(() => previewSchedule(draft, owed), [draft, owed]);

  const submit = async () => {
    setError(null);
    const orig = parseFloat(original);
    if (!name.trim()) return setError("Enter who you owe (provider, creditor or supplier).");
    if (!(orig > 0)) return setError("Enter the original debt amount.");
    if (!(owed > 0)) return setError("Enter the outstanding balance.");
    if (toCents(owed) > toCents(orig)) return setError("The outstanding balance can't be more than the original amount.");
    if (!preview.schedule) return setError(preview.problem ?? "The repayment schedule is incomplete.");
    const rate = interestRate ? parseFloat(interestRate) : undefined;
    if (rate !== undefined && (isNaN(rate) || rate < 0)) return setError("Interest rate must be 0 or more, or left empty.");
    if (startDate && endDate && endDate < startDate) return setError("The end date is before the start date.");
    if (recordPurchase && !purchaseDate) return setError("Enter the date of the purchase.");

    setSaving(true);
    try {
      await addDebt(
        {
          name: name.trim(),
          debtType,
          originalAmount: orig,
          outstandingBalance: owed,
          repaymentAmount: draftRepayment(draft),
          frequency: draft.frequency,
          interestRate: rate,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          referenceNo: referenceNo.trim() || undefined,
          notes: notes.trim() || undefined,
          purchase: recordPurchase ? { date: purchaseDate, category: purchaseCategory } : undefined,
        },
        preview.schedule
      );
      onSaved(`Added ${name.trim()} with ${preview.schedule.length} scheduled payment${preview.schedule.length === 1 ? "" : "s"}.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === "business" ? "Add business debt" : "Add personal debt"} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={mode === "business" ? "Creditor or supplier" : "Provider or person"}
            placeholder={mode === "business" ? "e.g. Kopi Bumi Roasters" : "e.g. Shopee PayLater"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="Debt type"
            value={debtType}
            onChange={(e) => {
              const t = e.target.value as DebtType;
              setDebtType(t);
              setRecordPurchase(PURCHASE_TYPES.has(t));
            }}
            options={types}
          />
          <Input label="Original amount (RM)" type="number" step="0.01" min="0" value={original} onChange={(e) => setOriginal(e.target.value)} />
          <Input
            label="Outstanding balance (RM)"
            type="number"
            step="0.01"
            min="0"
            placeholder={original || "Same as original"}
            value={outstanding}
            onChange={(e) => setOutstanding(e.target.value)}
          />
        </div>

        <ScheduleEditor draft={draft} onChange={setDraft} amount={owed} />

        <div className="rounded-2xl bg-gray/7 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={recordPurchase}
              onChange={(e) => setRecordPurchase(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded accent-[rgb(var(--accent))]"
            />
            <span>
              <span className="block text-headline text-label">Record what was bought as an expense</span>
              <span className="block text-footnote text-label-2">
                Adds {original ? formatRM(parseFloat(original) || 0) : "the original amount"} as spending on the purchase date, marked
                &quot;on credit&quot; so it doesn&apos;t reduce your cash. Repayments then reduce cash without counting the spending twice.
                Leave this off for cash loans, or if you already recorded the purchase.
              </span>
            </span>
          </label>
          {recordPurchase && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Spending category"
                value={purchaseCategory}
                onChange={(e) => setPurchaseCategory(e.target.value)}
                options={spendingCategories(mode).map((c) => ({ value: c, label: c }))}
              />
              <Input label="Purchase date" type="date" max={todayISO()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Interest rate (% p.a., optional)" type="number" step="0.01" min="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          <Input label="Start date (optional)" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Input
          label={mode === "business" ? "Invoice or reference number (optional)" : "Reference number (optional)"}
          value={referenceNo}
          onChange={(e) => setReferenceNo(e.target.value)}
        />
        <TextArea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && (
          <p className="flex items-start gap-1.5 rounded-xl bg-negative/12 px-3 py-2 text-footnote text-negative">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Add debt"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Edit details (never amounts or the schedule)
// ------------------------------------------------------------

function EditDebtModal({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const { updateDebt } = useFinance();
  const [name, setName] = useState("");
  const [debtType, setDebtType] = useState<DebtType>("other_personal");
  const [interestRate, setInterestRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!debt) return;
    setName(debt.name);
    setDebtType(debt.debtType);
    setInterestRate(debt.interestRate?.toString() ?? "");
    setStartDate(debt.startDate ?? "");
    setEndDate(debt.endDate ?? "");
    setReferenceNo(debt.referenceNo ?? "");
    setNotes(debt.notes ?? "");
    setError(null);
    setSaving(false);
  }, [debt]);

  if (!debt) return null;

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Name can't be empty.");
    const rate = interestRate ? parseFloat(interestRate) : undefined;
    if (rate !== undefined && (isNaN(rate) || rate < 0)) return setError("Interest rate must be 0 or more, or left empty.");
    if (startDate && endDate && endDate < startDate) return setError("The end date is before the start date.");
    setSaving(true);
    try {
      await updateDebt(debt.id, {
        name: name.trim(),
        debtType,
        interestRate: rate ?? null,
        startDate,
        endDate,
        referenceNo: referenceNo.trim(),
        notes: notes.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit debt details" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select label="Debt type" value={debtType} onChange={(e) => setDebtType(e.target.value as DebtType)} options={debtTypesFor(debt.mode)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Interest rate (% p.a.)" type="number" step="0.01" min="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Input label="Reference number" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <p className="flex items-start gap-1.5 text-footnote text-label-2">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Amounts and the repayment schedule can't be changed here, so paid history stays intact.
        </p>
        {error && (
          <p className="flex items-start gap-1.5 rounded-xl bg-negative/12 px-3 py-2 text-footnote text-negative">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
