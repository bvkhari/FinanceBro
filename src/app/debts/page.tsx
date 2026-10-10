"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, TextArea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { formatDate, formatRM, getRelativeTime, todayISO } from "@/lib/utils";
import { Debt, DebtFrequency, DebtInstalment, DebtType } from "@/lib/types";
import {
  DEBT_TYPE_LABELS,
  FREQUENCY_LABELS,
  INSTALMENT_STATUS_STYLE,
  debtTypesFor,
} from "@/lib/debt/labels";
import {
  ScheduledInstalment,
  generateSchedule,
  normaliseIrregularSchedule,
  toCents,
} from "@/lib/debt/schedule";

type View = "active" | "paid_off" | "all";

export default function DebtsPage() {
  const { mode, debts } = useFinance();
  const [view, setView] = useState<View>("active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [paying, setPaying] = useState<{ debt: Debt; instalment: DebtInstalment } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Messages and open rows belong to one profile; clear them when switching.
  useEffect(() => {
    setFlash(null);
    setExpanded(null);
  }, [mode]);

  const visible = useMemo(
    () => debts.filter((d) => view === "all" || d.status === view),
    [debts, view]
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <PageHeader
        title={mode === "business" ? "Business Debts" : "Personal Debts"}
        subtitle="What you owe, each repayment schedule, and the payments you've made."
        accessory={
          <Button onClick={() => setShowAdd(true)} icon={<Plus className="h-4 w-4" strokeWidth={2.5} />} className="max-sm:w-full">
            Add debt
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

      <Segmented
        aria-label="Filter debts"
        size="sm"
        className="mb-4 w-full sm:max-w-[20rem]"
        value={view}
        onChange={setView}
        options={(["active", "paid_off", "all"] as View[]).map((v) => ({
          value: v,
          label: `${{ active: "Active", paid_off: "Paid off", all: "All" }[v]} ${
            v === "all" ? debts.length : debts.filter((d) => d.status === v).length
          }`,
        }))}
      />

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
              expanded={expanded === debt.id}
              onToggle={() => setExpanded(expanded === debt.id ? null : debt.id)}
              onEdit={() => setEditing(debt)}
              onPay={(instalment) => setPaying({ debt, instalment })}
            />
          ))}
        </div>
      )}

      <AddDebtModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSaved={(msg) => setFlash(msg)} />
      <EditDebtModal debt={editing} onClose={() => setEditing(null)} />
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

// ------------------------------------------------------------
// Debt card with its repayment schedule
// ------------------------------------------------------------

function DebtCard({
  debt,
  expanded,
  onToggle,
  onEdit,
  onPay,
}: {
  debt: Debt;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPay: (i: DebtInstalment) => void;
}) {
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
                  {formatDate(next.dueDate)} · {getRelativeTime(next.dueDate)}
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
            <Button variant="outline" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
              Edit details
            </Button>
          </div>
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
                        {i.remaining > 0 && debt.status === "active" && (
                          <Button variant="success" size="sm" onClick={() => onPay(i)}>
                            Record payment
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Record a payment (full or partial)
// ------------------------------------------------------------

function PaymentModal({
  target,
  onClose,
  onPaid,
}: {
  target: { debt: Debt; instalment: DebtInstalment } | null;
  onClose: () => void;
  onPaid: (message: string) => void;
}) {
  const { recordPayment } = useFinance();
  const [amount, setAmount] = useState("");
  const [interest, setInterest] = useState("");
  const [paidDate, setPaidDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One key per payment attempt: a double submit records the payment once.
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (!target) return;
    setAmount(target.instalment.remaining.toFixed(2));
    setInterest("");
    setPaidDate(todayISO());
    setError(null);
    setSaving(false);
    setIdempotencyKey(crypto.randomUUID());
  }, [target]);

  if (!target) return null;
  const { debt, instalment } = target;
  const amt = parseFloat(amount);
  const int = interest ? parseFloat(interest) : 0;
  const isPartial = !isNaN(amt) && toCents(amt) < toCents(instalment.remaining);

  const submit = async () => {
    setError(null);
    if (isNaN(amt) || amt <= 0) return setError("Enter the amount you paid.");
    if (toCents(amt) > toCents(instalment.remaining)) {
      return setError(`You can record at most ${formatRM(instalment.remaining)} against this instalment.`);
    }
    if (isNaN(int) || int < 0 || int > amt) return setError("Interest and fees must be between RM0 and the amount paid.");
    if (!paidDate) return setError("Enter the date you paid.");

    setSaving(true);
    try {
      const r = await recordPayment({ instalmentId: instalment.id, amount: amt, paidDate, interest: int, idempotencyKey });
      onPaid(
        r.duplicate
          ? "That payment was already recorded, so nothing changed."
          : `Recorded ${formatRM(amt)} to ${debt.name}. ` +
              (r.instalment_remaining ? `${formatRM(r.instalment_remaining)} is still due on this instalment. ` : "") +
              `Outstanding balance is now ${formatRM(r.outstanding_balance ?? debt.outstandingBalance)}.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Record payment" size="sm">
      <div className="space-y-4">
        <div className="rounded-xl bg-gray/12 p-3 text-footnote text-label-2">
          <p className="text-headline text-label">{debt.name}</p>
          <p>
            Instalment due {formatDate(instalment.dueDate)} · {formatRM(instalment.amount)}
            {instalment.amountPaid > 0 && <> · {formatRM(instalment.amountPaid)} already paid</>}
          </p>
          <p className="mt-1 font-semibold text-label">Still due: {formatRM(instalment.remaining)}</p>
        </div>

        <Input label="Amount paid (RM)" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Date paid" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        <Input
          label="Of which interest and fees (RM, optional)"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
        />

        <p className="flex items-start gap-1.5 text-footnote text-label-2">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {isPartial ? "This is a partial payment. The rest stays due on this instalment. " : ""}
          Only record a payment you have already made. Interest and fees are recorded as an expense; the rest reduces
          what you owe.
        </p>

        {error && (
          <p className="flex items-start gap-1.5 rounded-xl bg-negative/12 px-3 py-2 text-footnote text-negative">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="success" className="flex-1" onClick={submit} disabled={saving}>
            {saving ? "Recording…" : isPartial ? "Record partial payment" : "Record full payment"}
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
// Add a debt with its schedule
// ------------------------------------------------------------

interface IrregularRow {
  key: number;
  due_date: string;
  amount: string;
}

function AddDebtModal({ isOpen, onClose, onSaved }: { isOpen: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const { mode, addDebt } = useFinance();
  const types = debtTypesFor(mode);

  const [name, setName] = useState("");
  const [debtType, setDebtType] = useState<DebtType>(types[0].value);
  const [original, setOriginal] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const [frequency, setFrequency] = useState<DebtFrequency>("monthly");
  const [repayment, setRepayment] = useState("");
  const [firstDue, setFirstDue] = useState(todayISO());
  const [rows, setRows] = useState<IrregularRow[]>([{ key: 0, due_date: todayISO(), amount: "" }]);
  const [interestRate, setInterestRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDebtType(debtTypesFor(mode)[0].value);
    setOriginal("");
    setOutstanding("");
    setFrequency("monthly");
    setRepayment("");
    setFirstDue(todayISO());
    setRows([{ key: 0, due_date: todayISO(), amount: "" }]);
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
  const preview = useMemo((): { schedule?: ScheduledInstalment[]; problem?: string } => {
    try {
      if (frequency === "irregular") {
        const filled = rows.filter((r) => r.due_date || r.amount);
        if (filled.length === 0) return { problem: "Add at least one payment." };
        return {
          schedule: normaliseIrregularSchedule(filled.map((r) => ({ due_date: r.due_date, amount: parseFloat(r.amount) }))),
        };
      }
      if (!(owed > 0)) return { problem: "Enter how much is still owed." };
      return {
        schedule: generateSchedule({
          amount: owed,
          frequency,
          firstDueDate: firstDue,
          instalmentAmount: frequency === "one_time" ? undefined : parseFloat(repayment),
        }),
      };
    } catch (e) {
      return { problem: e instanceof Error ? e.message : String(e) };
    }
  }, [frequency, rows, owed, firstDue, repayment]);

  const scheduleTotal = preview.schedule?.reduce((s, i) => s + toCents(i.amount), 0) ?? 0;

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

    setSaving(true);
    try {
      await addDebt(
        {
          name: name.trim(),
          debtType,
          originalAmount: orig,
          outstandingBalance: owed,
          repaymentAmount: frequency === "irregular" || frequency === "one_time" ? undefined : parseFloat(repayment),
          frequency,
          interestRate: rate,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          referenceNo: referenceNo.trim() || undefined,
          notes: notes.trim() || undefined,
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
          <Select label="Debt type" value={debtType} onChange={(e) => setDebtType(e.target.value as DebtType)} options={types} />
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

        <div className="rounded-2xl bg-gray/7 p-4">
          <p className="mb-3 text-headline text-label">Repayment schedule</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as DebtFrequency)}
              options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))}
            />
            {frequency !== "irregular" && (
              <Input label={frequency === "one_time" ? "Due date" : "First due date"} type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
            )}
            {frequency !== "irregular" && frequency !== "one_time" && (
              <Input label="Repayment per instalment (RM)" type="number" step="0.01" min="0" value={repayment} onChange={(e) => setRepayment(e.target.value)} />
            )}
          </div>

          {frequency === "irregular" && (
            <div className="mt-3 space-y-2">
              {rows.map((r, idx) => (
                <div key={r.key} className="flex items-end gap-2">
                  <Input
                    label={idx === 0 ? "Due date" : undefined}
                    type="date"
                    value={r.due_date}
                    onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, due_date: e.target.value } : x)))}
                  />
                  <Input
                    label={idx === 0 ? "Amount (RM)" : undefined}
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.amount}
                    onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))}
                  />
                  <button
                    className="mb-1 press rounded-lg p-2 text-label-3 hover:bg-gray/12 hover:text-negative disabled:opacity-30"
                    onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                    disabled={rows.length === 1}
                    aria-label="Remove payment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setRows([...rows, { key: Date.now(), due_date: "", amount: "" }])}
              >
                Add payment
              </Button>
            </div>
          )}

          <div className="mt-4">
            {preview.schedule ? (
              <>
                <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-label-3">
                  Preview · {preview.schedule.length} payment{preview.schedule.length === 1 ? "" : "s"} · total{" "}
                  {formatRM(scheduleTotal / 100)}
                </p>
                <div className="max-h-40 overflow-y-auto rounded-xl bg-gray/12 px-3 py-2 text-footnote">
                  {preview.schedule.map((i) => (
                    <div key={i.due_date} className="tabular flex justify-between py-0.5 text-label">
                      <span>{formatDate(i.due_date)}</span>
                      <span>{formatRM(i.amount)}</span>
                    </div>
                  ))}
                </div>
                {frequency === "irregular" && owed > 0 && scheduleTotal !== toCents(owed) && (
                  <p className="mt-1 text-footnote text-warning">
                    The payments add up to {formatRM(scheduleTotal / 100)}, but the outstanding balance is {formatRM(owed)}. That's fine
                    if the difference is interest or fees; otherwise adjust the amounts.
                  </p>
                )}
              </>
            ) : (
              <p className="text-footnote text-label-3">{preview.problem}</p>
            )}
          </div>
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
  const { mode, updateDebt } = useFinance();
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
        interestRate: rate,
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
          <Select label="Debt type" value={debtType} onChange={(e) => setDebtType(e.target.value as DebtType)} options={debtTypesFor(mode)} />
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
