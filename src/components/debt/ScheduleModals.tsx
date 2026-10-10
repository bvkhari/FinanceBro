"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatDate, formatRM, todayISO } from "@/lib/utils";
import { Debt, DebtInstalment } from "@/lib/types";
import { FREQUENCY_LABELS } from "@/lib/debt/labels";
import { ExistingInstalment, RegularFrequency, planScheduleExtension, toCents } from "@/lib/debt/schedule";
import { ScheduleDraft, ScheduleEditor, draftRepayment, emptyDraft, previewSchedule } from "@/components/debt/ScheduleEditor";

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-xl bg-negative/12 px-3 py-2 text-footnote text-negative">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      {error}
    </p>
  );
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Instalments the database treats as still open, in the shape the schedule planner expects. */
function asExisting(debt: Debt): ExistingInstalment[] {
  return debt.instalments.map((i) => ({
    due_date: i.dueDate,
    amount: i.amount,
    amount_paid: i.amountPaid,
    status: i.status === "upcoming" || i.status === "overdue" ? "scheduled" : i.status,
  }));
}

// ------------------------------------------------------------
// Edit or cancel one instalment
// ------------------------------------------------------------

export function EditInstalmentModal({
  target,
  onClose,
  onDone,
}: {
  target: { debt: Debt; instalment: DebtInstalment } | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { editInstalment, cancelInstalment } = useFinance();
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setDueDate(target.instalment.dueDate);
    setAmount(target.instalment.amount.toFixed(2));
    setConfirmCancel(false);
    setError(null);
    setSaving(false);
  }, [target]);

  if (!target) return null;
  const { debt, instalment } = target;
  const hasPayments = instalment.amountPaid > 0;

  const save = async () => {
    setError(null);
    const amt = parseFloat(amount);
    if (!dueDate) return setError("Enter a due date.");
    if (!(amt > 0)) return setError("Enter an amount above RM0.");
    if (toCents(amt) < toCents(instalment.amountPaid)) {
      return setError(`The amount can't be less than the ${formatRM(instalment.amountPaid)} already paid.`);
    }
    setSaving(true);
    try {
      await editInstalment(instalment.id, dueDate, amt);
      onDone(`Updated the ${debt.name} instalment: ${formatRM(amt)} due ${formatDate(dueDate)}.`);
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!confirmCancel) return setConfirmCancel(true);
    setSaving(true);
    try {
      await cancelInstalment(instalment.id);
      onDone(`Cancelled the ${debt.name} instalment due ${formatDate(instalment.dueDate)}. What you owe hasn't changed.`);
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit instalment" size="sm">
      <div className="space-y-4">
        <div className="rounded-xl bg-gray/12 p-3 text-footnote text-label-2">
          <p className="text-headline text-label">{debt.name}</p>
          <p>
            Currently {formatRM(instalment.amount)} due {formatDate(instalment.dueDate)}
            {hasPayments && <> · {formatRM(instalment.amountPaid)} already paid</>}
          </p>
        </div>
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <Input
          label="Amount (RM)"
          type="number"
          step="0.01"
          min={hasPayments ? instalment.amountPaid : 0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <p className="flex items-start gap-1.5 text-footnote text-label-2">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Only this instalment changes. Paid instalments and what you owe stay the same.
        </p>
        <ErrorNote error={error} />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </div>
        {!hasPayments && (
          <Button variant="danger" className="w-full" onClick={cancel} disabled={saving}>
            {confirmCancel ? "Tap again to cancel this instalment" : "Cancel this instalment"}
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Reschedule what is left
// ------------------------------------------------------------

export function RescheduleModal({ debt, onClose, onDone }: { debt: Debt | null; onClose: () => void; onDone: (message: string) => void }) {
  const { rescheduleDebt } = useFinance();
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Instalments with payments (partly paid) are kept; their unpaid part still counts.
  const kept = debt?.instalments.filter((i) => i.amountPaid > 0 && i.remaining > 0) ?? [];
  const replaced = debt?.instalments.filter((i) => i.amountPaid === 0 && i.remaining > 0) ?? [];
  const toSchedule = debt
    ? Math.max(0, toCents(debt.outstandingBalance) - kept.reduce((s, i) => s + toCents(i.remaining), 0)) / 100
    : 0;

  useEffect(() => {
    if (!debt) return;
    const first = debt.instalments.find((i) => i.amountPaid === 0 && i.remaining > 0)?.dueDate ?? todayISO();
    setDraft(emptyDraft(first, debt.frequency, debt.repaymentAmount?.toFixed(2) ?? ""));
    setError(null);
    setSaving(false);
  }, [debt]);

  const preview = useMemo(() => previewSchedule(draft, toSchedule), [draft, toSchedule]);
  if (!debt) return null;

  const submit = async () => {
    setError(null);
    if (!preview.schedule) return setError(preview.problem ?? "The new schedule is incomplete.");
    setSaving(true);
    try {
      const n = await rescheduleDebt(debt.id, draft.frequency, draftRepayment(draft), preview.schedule);
      onDone(`Rescheduled ${debt.name}: ${n} new payment${n === 1 ? "" : "s"}, ${FREQUENCY_LABELS[draft.frequency].replace(" (enter each payment)", "").toLowerCase()}.`);
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Reschedule ${debt.name}`} size="lg">
      <div className="space-y-4">
        <div className="rounded-xl bg-gray/12 p-3 text-footnote text-label-2">
          <p>
            Still owed: <span className="tabular font-semibold text-label">{formatRM(debt.outstandingBalance)}</span>
            {kept.length > 0 && (
              <>
                {" "}
                · {formatRM(kept.reduce((s, i) => s + i.remaining, 0))} stays on {kept.length} partly paid instalment
                {kept.length === 1 ? "" : "s"}
              </>
            )}
          </p>
          <p>
            The new schedule covers <span className="tabular font-semibold text-label">{formatRM(toSchedule)}</span> and replaces{" "}
            {replaced.length} unpaid instalment{replaced.length === 1 ? "" : "s"}. Paid and partly paid instalments stay exactly as they are.
          </p>
        </div>
        <ScheduleEditor draft={draft} onChange={setDraft} amount={toSchedule} title="New schedule" />
        <ErrorNote error={error} />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={saving || !preview.schedule}>
            {saving ? "Saving…" : "Replace unpaid instalments"}
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
// Add instalments for a balance that isn't scheduled yet
// ------------------------------------------------------------

export function ExtendScheduleModal({ debt, onClose, onDone }: { debt: Debt | null; onClose: () => void; onDone: (message: string) => void }) {
  const { addInstalments } = useFinance();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    setSaving(false);
  }, [debt]);

  const plan = useMemo(() => {
    if (!debt || !debt.repaymentAmount) return { problem: "This debt has no fixed repayment amount. Use Reschedule instead." };
    if (debt.frequency === "one_time" || debt.frequency === "irregular") return { problem: "Use Reschedule for one-time and irregular debts." };
    try {
      return {
        schedule: planScheduleExtension({
          outstanding: debt.outstandingBalance,
          frequency: debt.frequency as RegularFrequency,
          instalmentAmount: debt.repaymentAmount,
          existing: asExisting(debt),
          firstDueDate: todayISO(),
        }),
      };
    } catch (e) {
      return { problem: message(e) };
    }
  }, [debt]);

  if (!debt) return null;

  const submit = async () => {
    if (!plan.schedule?.length) return;
    setSaving(true);
    try {
      const n = await addInstalments(debt.id, plan.schedule);
      onDone(`Added ${n} instalment${n === 1 ? "" : "s"} to ${debt.name}.`);
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Add instalments" size="sm">
      <div className="space-y-4">
        <p className="text-subhead text-label-2">
          {formatRM(debt.unscheduledBalance)} of {debt.name} has no scheduled payment. These instalments continue the existing{" "}
          {FREQUENCY_LABELS[debt.frequency].toLowerCase()} schedule at {formatRM(debt.repaymentAmount ?? 0)}, after the last one. Nothing already
          scheduled or paid changes.
        </p>
        {plan.schedule ? (
          <div className="max-h-48 overflow-y-auto rounded-xl bg-gray/12 px-3 py-2 text-footnote">
            {plan.schedule.map((i) => (
              <div key={i.due_date} className="tabular flex justify-between py-0.5 text-label">
                <span>{formatDate(i.due_date)}</span>
                <span>{formatRM(i.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-footnote text-label-3">{plan.problem}</p>
        )}
        <ErrorNote error={error} />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={saving || !plan.schedule?.length}>
            {saving ? "Adding…" : `Add ${plan.schedule?.length ?? 0} instalment${plan.schedule?.length === 1 ? "" : "s"}`}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
