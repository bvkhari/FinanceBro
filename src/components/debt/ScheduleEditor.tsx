"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { formatDate, formatRM, todayISO } from "@/lib/utils";
import { DebtFrequency } from "@/lib/types";
import { FREQUENCY_LABELS } from "@/lib/debt/labels";
import { ScheduledInstalment, generateSchedule, normaliseIrregularSchedule, toCents } from "@/lib/debt/schedule";

interface IrregularRow {
  key: number;
  due_date: string;
  amount: string;
}

/** What the user has typed for a repayment schedule (strings, as in the form). */
export interface ScheduleDraft {
  frequency: DebtFrequency;
  repayment: string;
  firstDue: string;
  rows: IrregularRow[];
}

export function emptyDraft(firstDue = todayISO(), frequency: DebtFrequency = "monthly", repayment = ""): ScheduleDraft {
  return { frequency, repayment, firstDue, rows: [{ key: 0, due_date: firstDue, amount: "" }] };
}

/** Turns a draft into instalments with the shared generator, or explains what's missing. */
export function previewSchedule(draft: ScheduleDraft, amount: number): { schedule?: ScheduledInstalment[]; problem?: string } {
  try {
    if (draft.frequency === "irregular") {
      const filled = draft.rows.filter((r) => r.due_date || r.amount);
      if (filled.length === 0) return { problem: "Add at least one payment." };
      return { schedule: normaliseIrregularSchedule(filled.map((r) => ({ due_date: r.due_date, amount: parseFloat(r.amount) }))) };
    }
    if (!(amount > 0)) return { problem: "Enter how much is still owed." };
    return {
      schedule: generateSchedule({
        amount,
        frequency: draft.frequency,
        firstDueDate: draft.firstDue,
        instalmentAmount: draft.frequency === "one_time" ? undefined : parseFloat(draft.repayment),
      }),
    };
  } catch (e) {
    return { problem: e instanceof Error ? e.message : String(e) };
  }
}

/** Repayment amount to store for a draft (none for one-time and irregular schedules). */
export const draftRepayment = (d: ScheduleDraft) =>
  d.frequency === "one_time" || d.frequency === "irregular" ? undefined : parseFloat(d.repayment);

/**
 * Frequency, first due date and repayment fields (or one row per payment for
 * irregular schedules), with a live preview of the instalments that will be saved.
 */
export function ScheduleEditor({
  draft,
  onChange,
  amount,
  title = "Repayment schedule",
}: {
  draft: ScheduleDraft;
  onChange: (d: ScheduleDraft) => void;
  amount: number; // what the schedule should cover
  title?: string;
}) {
  const { frequency, repayment, firstDue, rows } = draft;
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });
  const setRows = (r: IrregularRow[]) => set({ rows: r });
  const preview = useMemo(() => previewSchedule(draft, amount), [draft, amount]);
  const total = preview.schedule?.reduce((s, i) => s + toCents(i.amount), 0) ?? 0;

  return (
    <div className="rounded-2xl bg-gray/7 p-4">
      <p className="mb-3 text-headline text-label">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select
          label="Frequency"
          value={frequency}
          onChange={(e) => set({ frequency: e.target.value as DebtFrequency })}
          options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))}
        />
        {frequency !== "irregular" && (
          <Input
            label={frequency === "one_time" ? "Due date" : "First due date"}
            type="date"
            value={firstDue}
            onChange={(e) => set({ firstDue: e.target.value })}
          />
        )}
        {frequency !== "irregular" && frequency !== "one_time" && (
          <Input
            label="Repayment per instalment (RM)"
            type="number"
            step="0.01"
            min="0"
            value={repayment}
            onChange={(e) => set({ repayment: e.target.value })}
          />
        )}
      </div>

      {frequency === "irregular" && (
        <div className="mt-3 space-y-2">
          {rows.map((r, idx) => (
            <div key={r.key} className="flex items-end gap-2">
              <Input
                label={idx === 0 ? "Due date" : undefined}
                aria-label={`Payment ${idx + 1} due date`}
                type="date"
                value={r.due_date}
                onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, due_date: e.target.value } : x)))}
              />
              <Input
                label={idx === 0 ? "Amount (RM)" : undefined}
                aria-label={`Payment ${idx + 1} amount`}
                type="number"
                step="0.01"
                min="0"
                value={r.amount}
                onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))}
              />
              <button
                className="press mb-1 rounded-lg p-2 text-label-3 hover:bg-gray/12 hover:text-negative disabled:opacity-30"
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
              Preview · {preview.schedule.length} payment{preview.schedule.length === 1 ? "" : "s"} · total {formatRM(total / 100)}
            </p>
            <div className="max-h-40 overflow-y-auto rounded-xl bg-gray/12 px-3 py-2 text-footnote">
              {preview.schedule.map((i) => (
                <div key={i.due_date} className="tabular flex justify-between py-0.5 text-label">
                  <span>{formatDate(i.due_date)}</span>
                  <span>{formatRM(i.amount)}</span>
                </div>
              ))}
            </div>
            {frequency === "irregular" && amount > 0 && total !== toCents(amount) && (
              <p className="mt-1 text-footnote text-warning">
                The payments add up to {formatRM(total / 100)}, but {formatRM(amount)} needs scheduling. That&apos;s fine if the difference
                is interest or fees; otherwise adjust the amounts.
              </p>
            )}
          </>
        ) : (
          <p className="text-footnote text-label-3">{preview.problem}</p>
        )}
      </div>
    </div>
  );
}
