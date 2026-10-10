"use client";

import { useState, useMemo, useEffect } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { FinancialCommitment, PaymentStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { formatRM, formatDate, formatDateShort, getRelativeTime, isOverdue, daysUntil, todayISO } from "@/lib/utils";
import { AlertTriangle, Repeat, Check } from "lucide-react";
import { BILL_CATEGORIES } from "@/lib/categories";

/**
 * The Bills report on the Payments page: totals, what's next, and every bill.
 * The page's Add picker opens the new-bill sheet through `adding`.
 */
export function BillsSection({ adding, onAddingChange }: { adding: boolean; onAddingChange: (v: boolean) => void }) {
  const { mode, commitments, addCommitment, updateCommitment, markCommitmentPaid } = useFinance();
  const showAddModal = adding;
  const setShowAddModal = onAddingChange;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | "">("");

  const categories = BILL_CATEGORIES[mode];

  const totalUpcoming = commitments
    .filter((c) => c.status === "upcoming" || c.status === "overdue")
    .reduce((s, c) => s + c.amount, 0);

  const totalOverdue = commitments
    .filter((c) => c.status === "overdue" || (c.status !== "paid" && isOverdue(c.dueDate)))
    .reduce((s, c) => s + c.amount, 0);

  const totalPaid = commitments
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + c.amount, 0);

  const monthlyRecurring = commitments.filter((c) => c.recurring).reduce((s, c) => s + c.amount, 0);

  // Auto-detect overdue
  const commitmentsWithStatus = useMemo(() => {
    return commitments.map((c) => {
      if (c.status === "paid") return c;
      if (isOverdue(c.dueDate) && c.status !== "overdue") {
        return { ...c, status: "overdue" as PaymentStatus };
      }
      return c;
    });
  }, [commitments]);

  const filteredCommitments = useMemo(() => {
    if (!filterStatus) return commitmentsWithStatus;
    return commitmentsWithStatus.filter((c) => c.status === filterStatus);
  }, [commitmentsWithStatus, filterStatus]);

  const sortedCommitments = useMemo(() => {
    return [...filteredCommitments].sort((a, b) => {
      // Paid at bottom, then by due date
      if (a.status === "paid" && b.status !== "paid") return 1;
      if (a.status !== "paid" && b.status === "paid") return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [filteredCommitments]);

  const upcomingDueDates = useMemo(() => {
    const upcoming = commitments
      .filter((c) => c.status !== "paid")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return upcoming.slice(0, 3);
  }, [commitments]);

  const openNew = () => {
    setEditingId(null);
    setShowAddModal(true);
  };

  return (
    <div>
      <p className="mb-3 px-1 text-subhead text-label-2">
        Bills that repeat cost <span className="tabular font-semibold text-label">{formatRM(monthlyRecurring)}</span> a month.
      </p>
      <div className="mb-8 grid grid-cols-3 divide-x divide-[color:var(--separator)] rounded-2xl bg-surface py-4 shadow-card">
        {[
          { label: "To pay", value: totalUpcoming, cls: "text-label" },
          { label: "Overdue", value: totalOverdue, cls: totalOverdue > 0 ? "text-negative" : "text-label" },
          { label: "Paid", value: totalPaid, cls: "text-positive" },
        ].map((s) => (
          <div key={s.label} className="px-3 text-center sm:px-5 sm:text-left">
            <p className="text-footnote text-label-2">{s.label}</p>
            <p className={`tabular mt-1 whitespace-nowrap text-subhead font-semibold sm:text-title3 ${s.cls}`}>{formatRM(s.value)}</p>
          </div>
        ))}
      </div>

      {upcomingDueDates.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 px-1 text-title3">Next up</h2>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
            {upcomingDueDates.map((c) => {
              const days = daysUntil(c.dueDate);
              const late = c.status === "overdue" || days < 0;
              const soon = !late && days <= 3;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setEditingId(c.id);
                    setShowAddModal(true);
                  }}
                  className="press w-[72%] shrink-0 snap-start rounded-2xl bg-surface p-4 text-left shadow-card sm:w-auto"
                >
                  <p className={`text-footnote font-semibold ${late ? "text-negative" : soon ? "text-warning" : "text-label-2"}`}>
                    {getRelativeTime(c.dueDate)}
                  </p>
                  <p className="tabular mt-2 text-title2">{formatRM(c.amount)}</p>
                  <p className="mt-0.5 truncate text-subhead text-label-2">{c.name}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="px-1 text-title3">All bills</h2>
        <Segmented
          aria-label="Filter by status"
          size="sm"
          className="w-full sm:max-w-[20rem]"
          value={filterStatus || "all"}
          onChange={(v) => setFilterStatus(v === "all" ? "" : v)}
          options={[
            { value: "all", label: "All" },
            { value: "upcoming", label: "Upcoming" },
            { value: "overdue", label: "Overdue" },
            { value: "paid", label: "Paid" },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        {sortedCommitments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-headline">{filterStatus ? `No ${filterStatus} bills` : "No bills yet"}</p>
            <p className="mt-1 text-subhead text-label-2">
              {filterStatus ? "Try another filter." : "Add rent, loans or subscriptions so nothing sneaks up on you."}
            </p>
            {!filterStatus && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={openNew}>
                Add bill
              </Button>
            )}
          </div>
        ) : (
          <ul className="grouped-inset" style={{ ["--inset" as string]: "3.5rem" }}>
            {sortedCommitments.map((c) => (
              <CommitmentItem
                key={c.id}
                commitment={c}
                onMarkPaid={() => markCommitmentPaid(c.id)}
                onEdit={() => {
                  setEditingId(c.id);
                  setShowAddModal(true);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <CommitmentModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingId(null);
        }}
        categories={categories}
        editingCommitment={editingId ? commitments.find((c) => c.id === editingId) ?? null : null}
        onSave={(data) => {
          if (editingId) {
            updateCommitment(editingId, data);
          } else {
            addCommitment(data);
          }
          setShowAddModal(false);
          setEditingId(null);
        }}
      />
    </div>
  );
}

function CommitmentItem({
  commitment,
  onMarkPaid,
  onEdit,
}: {
  commitment: FinancialCommitment;
  onMarkPaid: () => void;
  onEdit: () => void;
}) {
  const days = daysUntil(commitment.dueDate);
  const isOverdueStatus = commitment.status === "overdue" || (commitment.status !== "paid" && days < 0);
  const isPaid = commitment.status === "paid";

  const note = isPaid ? "Paid" : getRelativeTime(commitment.dueDate);
  const noteCls = isPaid
    ? "text-positive"
    : isOverdueStatus
    ? "font-medium text-negative"
    : days <= 3
    ? "font-medium text-warning"
    : "text-label-2";

  return (
    <li className="flex items-center">
      {/* Reminders-style completion circle: the ring color carries the status */}
      <button
        onClick={onMarkPaid}
        disabled={isPaid}
        aria-label={isPaid ? `${commitment.name} is paid` : `Mark ${commitment.name} as paid`}
        className="group flex h-14 w-14 shrink-0 items-center justify-center"
      >
        <span
          className={`flex h-[1.4rem] w-[1.4rem] items-center justify-center rounded-full transition-[background-color,transform] duration-500 ease-spring group-active:scale-90 ${
            isPaid
              ? "bg-positive text-white"
              : isOverdueStatus
              ? "ring-[1.5px] ring-inset ring-negative group-hover:bg-negative/10"
              : "ring-[1.5px] ring-inset ring-label-3 group-hover:bg-gray/10"
          }`}
        >
          {isPaid && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
        </span>
      </button>
      <button onClick={onEdit} className="row-press flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 text-left">
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 text-body ${isPaid ? "text-label-2" : "text-label"}`}>
            <span className="truncate">{commitment.name}</span>
            {commitment.recurring && <Repeat className="h-3.5 w-3.5 shrink-0 text-label-3" aria-label="Repeats monthly" />}
          </span>
          <span className="block truncate text-footnote text-label-2">
            <span className={noteCls}>{note}</span>
            {isOverdueStatus && !isPaid ? <AlertTriangle className="mb-0.5 ml-1 inline h-3 w-3 text-negative" /> : null}
            <span className="hidden sm:inline"> · {formatDate(commitment.dueDate)}</span>
            <span className="sm:hidden"> · {formatDateShort(commitment.dueDate)}</span>
            {" · "}
            {commitment.category}
          </span>
        </span>
        <span className={`tabular text-body font-medium ${isPaid ? "text-label-2 line-through decoration-label-3" : ""}`}>
          {formatRM(commitment.amount)}
        </span>
      </button>
    </li>
  );
}

interface CommitmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  editingCommitment: FinancialCommitment | null;
  onSave: (data: Omit<FinancialCommitment, "id" | "createdAt" | "mode">) => void;
}

function CommitmentModal({ isOpen, onClose, categories, editingCommitment, onSave }: CommitmentModalProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [category, setCategory] = useState(categories[0] || "Other");
  const [status, setStatus] = useState<PaymentStatus>("upcoming");
  const [recurring, setRecurring] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingCommitment) {
      setName(editingCommitment.name);
      setAmount(editingCommitment.amount.toString());
      setDueDate(editingCommitment.dueDate);
      setCategory(editingCommitment.category);
      setStatus(editingCommitment.status);
      setRecurring(editingCommitment.recurring);
    } else {
      setName("");
      setAmount("");
      setDueDate(todayISO());
      setCategory(categories[0] || "Other");
      setStatus("upcoming");
      setRecurring(true);
    }
    setErrors({});
  }, [editingCommitment, isOpen]);

  const handleSave = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Give it a name.";
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      newErrors.amount = "Enter an amount above zero.";
    }
    if (!dueDate) newErrors.dueDate = "Pick a due date.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      name: name.trim(),
      amount: parsedAmount,
      dueDate,
      category,
      status,
      recurring,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingCommitment ? "Edit bill" : "New bill"} size="md">
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Room rent"
          error={errors.name}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount (RM)"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            error={errors.amount}
            className="tabular"
          />
          <Input
            label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            error={errors.dueDate}
          />
        </div>

        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={categories.map((c) => ({ value: c, label: c }))}
        />

        <div>
          <p className="mb-1.5 px-1 text-footnote font-medium text-label-2">Status</p>
          <Segmented
            aria-label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "overdue", label: "Overdue" },
              { value: "paid", label: "Paid" },
            ]}
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-gray/7 px-4 py-3">
          <span>
            <span className="block text-body">Repeats monthly</span>
            <span className="block text-footnote text-label-2">Same amount, same day each month.</span>
          </span>
          <Switch checked={recurring} onChange={setRecurring} />
        </label>

        <Button variant="primary" size="lg" onClick={handleSave} className="w-full">
          {editingCommitment ? "Save changes" : "Add bill"}
        </Button>
      </div>
    </Modal>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[1.9rem] w-[3.2rem] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-positive" : "bg-gray/22"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-[1.65rem] w-[1.65rem] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-500 ease-spring ${
          checked ? "translate-x-[1.3rem]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
