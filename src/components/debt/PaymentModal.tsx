"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatDate, formatRM, todayISO } from "@/lib/utils";
import { toCents } from "@/lib/debt/schedule";

// ------------------------------------------------------------
// Record a payment (full or partial)
// ------------------------------------------------------------

/** The instalment being paid. Built from a debt's schedule row or from a payment list item. */
export interface PaymentTarget {
  payee: string;
  instalmentId: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  remaining: number;
}

export function PaymentModal({
  target,
  onClose,
  onPaid,
}: {
  target: PaymentTarget | null;
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
    setAmount(target.remaining.toFixed(2));
    setInterest("");
    setPaidDate(todayISO());
    setError(null);
    setSaving(false);
    setIdempotencyKey(crypto.randomUUID());
  }, [target]);

  if (!target) return null;
  const instalment = target;
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
    if (paidDate > todayISO()) return setError("The payment date can't be in the future. Only record payments you've already made.");

    setSaving(true);
    try {
      const r = await recordPayment({ instalmentId: target.instalmentId, amount: amt, paidDate, interest: int, idempotencyKey });
      onPaid(
        r.duplicate
          ? "That payment was already recorded, so nothing changed."
          : `Recorded ${formatRM(amt)} to ${target.payee}. ` +
              (r.instalment_remaining ? `${formatRM(r.instalment_remaining)} is still due on this instalment. ` : "") +
              `Outstanding balance is now ${formatRM(r.outstanding_balance ?? 0)}.`
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
          <p className="text-headline text-label">{target.payee}</p>
          <p>
            Instalment due {formatDate(instalment.dueDate)} · {formatRM(instalment.amount)}
            {instalment.amountPaid > 0 && <> · {formatRM(instalment.amountPaid)} already paid</>}
          </p>
          <p className="mt-1 font-semibold text-label">Still due: {formatRM(instalment.remaining)}</p>
        </div>

        <Input label="Amount paid (RM)" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Date paid" type="date" max={todayISO()} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
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
