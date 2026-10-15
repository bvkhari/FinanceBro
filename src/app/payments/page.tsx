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
import { MoneyCard } from "@/components/ui/MoneyCard";
import { Segmented } from "@/components/ui/Segmented";
import { formatDate, formatDateShort, formatRM, todayISO } from "@/lib/utils";
import { Debt, DebtInstalment } from "@/lib/types";
import { BNPL_PROVIDERS, FREQUENCY_LABELS, INSTALMENT_STATUS_STYLE } from "@/lib/debt/labels";
import { PaymentModal, PaymentTarget } from "@/components/debt/PaymentModal";
import { CreditorGroups } from "@/components/debt/CreditorGroups";
import { useDebtView } from "@/lib/debt/useDebtView";
import { EditInstalmentModal, ExtendScheduleModal, RescheduleModal } from "@/components/debt/ScheduleModals";
import { ScheduleDraft, ScheduleEditor, draftRepayment, emptyDraft, previewSchedule } from "@/components/debt/ScheduleEditor";
import { downloadCsv } from "@/lib/csv";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PaymentItem, addDays, balanceHistory, countdown, dueWithin, extraPaymentScenario, groupByCreditor, payoffSummary, totalDue } from "@/lib/debt/payments";
import { toCents } from "@/lib/debt/schedule";

type View = "active" | "paid_off" | "all";
type Range = 7 | 30;

export default function PaymentsPage() {
  const { today, debts, payments, overview } = useDebtView();
  const [range, setRange] = useState<Range>(30);
  const [view, setView] = useState<View>("active");
  const [sort, setSort] = useState<"due" | "owed">("due");
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

  // Deep links: ?range=7, ?add=debt (from the dashboard's quick actions).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("range") === "7") setRange(7);
    if (q.get("add") === "debt") setShowAdd(true);
    if (q.toString()) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const visible = useMemo(() => {
    const list = debts.filter((d) => view === "all" || d.status === view);
    const due = (d: Debt) => d.nextInstalment?.dueDate ?? "9999";
    return list.sort((a, b) =>
      sort === "owed" ? b.outstandingBalance - a.outstandingBalance || due(a).localeCompare(due(b)) : due(a).localeCompare(due(b))
    );
  }, [debts, view, sort]);
  // Everything due by today + range, overdue included, one group per creditor in the order to pay them.
  const shown = useMemo(() => dueWithin(payments, range, today), [payments, range, today]);
  const groups = useMemo(() => groupByCreditor(shown, debts), [shown, debts]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <PageHeader
        title="PayLater"
        subtitle="Every Buy Now, Pay Later plan you owe, in the order to pay them."
        accessory={
          <Button onClick={() => setShowAdd(true)} icon={<Plus className="h-4 w-4" strokeWidth={2.5} />} className="max-sm:w-full">
            Add PayLater
          </Button>
        }
      />

      {flash && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-2xl bg-positive/12 px-4 py-3 text-subhead text-label">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-positive" />
          <span className="flex-1">{flash}</span>
          <button className="press text-footnote font-semibold text-accent-text" onClick={() => setFlash(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section aria-label="To pay" className="mb-10">
          <h2 className="mb-2 px-1 text-title3">To pay</h2>
          <Segmented<`${Range}`>
            aria-label="Period"
            className="mb-4 w-full sm:w-72"
            value={`${range}`}
            onChange={(v) => setRange(Number(v) as Range)}
            options={[
              { value: "7", label: "Next 7 days" },
              { value: "30", label: "Next 30 days" },
            ]}
          />

          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <p className="text-subhead text-label-2">
              <span className="tabular text-title3 text-label">{formatRM(totalDue(shown))}</span> to pay by{" "}
              {formatDateShort(addDays(today, range))} · {shown.length} payment{shown.length === 1 ? "" : "s"}
            </p>
            <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} disabled={!shown.length} onClick={() => exportPayments(shown, range)}>
              CSV
            </Button>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-2xl bg-surface px-6 py-14 text-center shadow-card">
              <p className="text-headline">Nothing due in the next {range} days</p>
            </div>
          ) : (
            <CreditorGroups
              key={range}
              groups={groups}
              today={today}
              openFirst
              onPay={(p) =>
                setPaying({ payee: p.payee, instalmentId: p.instalmentId!, dueDate: p.dueDate, amount: p.amount, amountPaid: p.amountPaid, remaining: p.remaining })
              }
            />
          )}
          <p className="mt-3 px-1 text-footnote text-label-3">
            Overdue payments are included. Order: overdue first, then the soonest due date, then the highest interest rate.
          </p>
      </section>

      <h2 className="mb-4 px-1 text-title3">Your plans</h2>

        <section aria-label="PayLater plans">
          <MoneyCard
            className="mb-5"
            label="Total outstanding"
            tag={`${overview.activeDebts} active`}
            value={overview.totalOutstanding}
            stats={[
              { label: "Due this month", value: overview.dueThisMonth },
              ...(overview.overdue > 0 ? [{ label: "Overdue", value: overview.overdue, tone: "negative" as const }] : []),
            ]}
          />
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
              { value: "owed", label: "Most owed" },
            ]}
          />
          </div>

          {visible.length > 0 && (
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <p className="text-footnote text-label-2">
                <span className="font-semibold text-label">Owed by provider: </span>
                {byProvider(visible).map(([t, amt]) => `${t} ${formatRM(amt)}`).join(" · ")}
              </p>
              <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportDebts(visible)}>
                CSV
              </Button>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="rounded-2xl bg-surface px-6 py-14 text-center shadow-card">
              <p className="text-headline">{view === "paid_off" ? "Nothing paid off yet" : "No PayLater plans here"}</p>
              <p className="mt-1 text-subhead text-label-2">Add a Shopee, TikTok, Grab or Atome plan to track what you owe and when to pay it.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((debt) => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
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

/** Outstanding per provider, largest first. */
function byProvider(debts: Debt[]): [string, number][] {
  const m = new Map<string, number>();
  for (const d of debts) m.set(d.name, (m.get(d.name) ?? 0) + Math.round(d.outstandingBalance * 100));
  return [...m].map(([t, c]) => [t, c / 100] as [string, number]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
}

function exportPayments(items: PaymentItem[], range: Range) {
  downloadCsv(`payments-next-${range}-days-${todayISO()}.csv`, [
    ["Provider", "Frequency", "Due date", "Amount", "Paid", "Still due", "Paid on", "Status"],
    ...items.map((p) => [
      p.payee, p.frequency, p.dueDate, p.amount.toFixed(2), p.amountPaid.toFixed(2),
      p.remaining.toFixed(2), p.paidDate, INSTALMENT_STATUS_STYLE[p.status].label,
    ]),
  ]);
}

function exportDebts(debts: Debt[]) {
  downloadCsv(`paylater-plans-${todayISO()}.csv`, [
    ["Provider", "What was bought", "Order / reference", "Original", "Outstanding", "Repaid", "Repayment", "Frequency", "Interest % p.a.", "Next due", "Next amount", "Status"],
    ...debts.map((d) => [
      d.name, d.notes, d.referenceNo, d.originalAmount.toFixed(2), d.outstandingBalance.toFixed(2),
      ((Math.round(d.originalAmount * 100) - Math.round(d.outstandingBalance * 100)) / 100).toFixed(2), d.repaymentAmount?.toFixed(2),
      FREQUENCY_LABELS[d.frequency], d.interestRate, d.nextInstalment?.dueDate, d.nextInstalment?.remaining.toFixed(2), d.status.replace("_", " "),
    ]),
  ]);
}

// ------------------------------------------------------------
// Debt card with its repayment schedule
// ------------------------------------------------------------

function DebtCard({
  debt,
  expanded,
  onToggle,
  onEdit,
  onPay,
  onEditInstalment,
  onReschedule,
  onExtend,
}: {
  debt: Debt;
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
          {debt.notes && <p className="mt-0.5 truncate text-subhead text-label-2">{debt.notes}</p>}
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
          <BalanceHistory debt={debt} />
          {active && debt.outstandingBalance > 0 && <ExtraPayment debt={debt} />}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Balance over time, from recorded payments only
// ------------------------------------------------------------

function BalanceHistory({ debt }: { debt: Debt }) {
  const points = balanceHistory(debt);
  if (points.length < 2) return null;
  const tick = { fontSize: 11, fill: "rgb(var(--label-2) / 0.62)" };
  return (
    <div className="mt-3">
      <p className="mb-1 px-1 text-caption font-semibold uppercase tracking-wide text-label-3">
        Balance history · {points.length - 1} payment date{points.length === 2 ? "" : "s"}
      </p>
      <div className="h-36" role="img" aria-label={`Balance went from ${formatRM(points[0].balance)} to ${formatRM(points[points.length - 1].balance)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--separator)" vertical={false} />
            <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} tickFormatter={formatDateShort} minTickGap={24} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={48} domain={[0, "auto"]} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
            <Tooltip
              formatter={(v: number) => [formatRM(v), "Owed"]}
              labelFormatter={(d: string) => formatDate(d)}
              contentStyle={{ background: "rgb(var(--elevated))", border: "none", borderRadius: 12, boxShadow: "var(--shadow-float)", fontSize: 12 }}
            />
            <Line type="stepAfter" dataKey="balance" stroke="rgb(var(--accent))" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// "What if I pay extra?" — a comparison only, nothing is paid
// ------------------------------------------------------------

function ExtraPayment({ debt }: { debt: Debt }) {
  const { cashFlow } = useFinance();
  const [extra, setExtra] = useState<number | null>(null);
  const s = extra ? extraPaymentScenario(debt, extra, todayISO()) : null;
  const cashAfter = s ? (Math.round(cashFlow.projectedCash * 100) - Math.round(s.extra * 100)) / 100 : undefined;

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
            {payoffSummary(s, formatDate)}
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
// Add a PayLater plan with its schedule
// ------------------------------------------------------------

const OTHER = "__other";

function AddDebtModal({ isOpen, onClose, onSaved }: { isOpen: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const { addDebt } = useFinance();

  const [provider, setProvider] = useState<string>(BNPL_PROVIDERS[0]);
  const [otherName, setOtherName] = useState("");
  const [item, setItem] = useState("");
  const [original, setOriginal] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft());
  const [interestRate, setInterestRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setProvider(BNPL_PROVIDERS[0]);
    setOtherName("");
    setItem("");
    setOriginal("");
    setOutstanding("");
    setDraft(emptyDraft());
    setInterestRate("");
    setStartDate("");
    setReferenceNo("");
    setError(null);
    setSaving(false);
  }, [isOpen]);

  const name = provider === OTHER ? otherName.trim() : provider;
  const owed = parseFloat(outstanding || original);

  // The schedule is computed by the same generator the seed and tests use.
  const preview = useMemo(() => previewSchedule(draft, owed), [draft, owed]);

  const submit = async () => {
    setError(null);
    const orig = parseFloat(original);
    if (!name) return setError("Enter the PayLater provider.");
    if (!(orig > 0)) return setError("Enter the total you agreed to pay back.");
    if (!(owed > 0)) return setError("Enter how much is still owed.");
    if (toCents(owed) > toCents(orig)) return setError("What's still owed can't be more than the total.");
    if (!preview.schedule) return setError(preview.problem ?? "The repayment schedule is incomplete.");
    const rate = interestRate ? parseFloat(interestRate) : undefined;
    if (rate !== undefined && (isNaN(rate) || rate < 0)) return setError("Interest rate must be 0 or more, or left empty.");

    setSaving(true);
    try {
      await addDebt(
        {
          name,
          debtType: "bnpl",
          originalAmount: orig,
          outstandingBalance: owed,
          repaymentAmount: draftRepayment(draft),
          frequency: draft.frequency,
          interestRate: rate,
          startDate: startDate || undefined,
          referenceNo: referenceNo.trim() || undefined,
          notes: item.trim() || undefined,
        },
        preview.schedule
      );
      onSaved(`Added ${name} with ${preview.schedule.length} instalment${preview.schedule.length === 1 ? "" : "s"}.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add a PayLater plan" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            options={[...BNPL_PROVIDERS.map((p) => ({ value: p, label: p })), { value: OTHER, label: "Other" }]}
          />
          {provider === OTHER ? (
            <Input label="Provider name" placeholder="e.g. Boost PayFlex" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
          ) : (
            <Input label="What did you buy? (optional)" placeholder="e.g. Wireless earbuds" value={item} onChange={(e) => setItem(e.target.value)} />
          )}
          <Input label="Total to pay back (RM)" type="number" step="0.01" min="0" value={original} onChange={(e) => setOriginal(e.target.value)} />
          <Input
            label="Still owed (RM)"
            type="number"
            step="0.01"
            min="0"
            placeholder={original || "Same as total"}
            value={outstanding}
            onChange={(e) => setOutstanding(e.target.value)}
          />
        </div>
        {provider === OTHER && (
          <Input label="What did you buy? (optional)" placeholder="e.g. Wireless earbuds" value={item} onChange={(e) => setItem(e.target.value)} />
        )}

        <ScheduleEditor draft={draft} onChange={setDraft} amount={owed} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Interest rate (% p.a., optional)" type="number" step="0.01" min="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          <Input label="Purchase date (optional)" type="date" max={todayISO()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="Order number (optional)" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        </div>

        {error && (
          <p className="flex items-start gap-1.5 rounded-xl bg-negative/12 px-3 py-2 text-footnote text-negative">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Add plan"}
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
    <Modal isOpen onClose={onClose} title="Edit plan details" size="md">
      <div className="space-y-4">
        <Input label="Provider" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Interest rate (% p.a.)" type="number" step="0.01" min="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Input label="Order number" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        <TextArea label="What was bought / notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
