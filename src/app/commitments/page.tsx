"use client";

import { useState, useMemo, useEffect } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { FinancialCommitment, PaymentStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, TextArea } from "@/components/ui/Input";
import { formatRM, formatDate, getRelativeTime, isOverdue, daysUntil, todayISO } from "@/lib/utils";
import {
  Plus,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Receipt,
  Check,
  Pencil,
  Trash2,
  Calendar,
  Wallet,
  TrendingUp,
} from "lucide-react";

const INDIVIDUAL_COMMITMENT_CATEGORIES = [
  "Rent",
  "Internet",
  "Utilities",
  "Instalments",
  "Other",
];

const BUSINESS_COMMITMENT_CATEGORIES = [
  "Supplier Payments",
  "Business Rent",
  "Instalments",
  "Other Business Bills",
  "Other",
];

export default function CommitmentsPage() {
  const { mode, commitments, addCommitment, updateCommitment, markCommitmentPaid } = useFinance();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | "">("");

  const categories = mode === "individual" ? INDIVIDUAL_COMMITMENT_CATEGORIES : BUSINESS_COMMITMENT_CATEGORIES;

  const totalUpcoming = commitments
    .filter((c) => c.status === "upcoming" || c.status === "overdue")
    .reduce((s, c) => s + c.amount, 0);

  const totalOverdue = commitments
    .filter((c) => c.status === "overdue" || (c.status !== "paid" && isOverdue(c.dueDate)))
    .reduce((s, c) => s + c.amount, 0);

  const totalPaid = commitments
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + c.amount, 0);

  const outstandingCount = commitments.filter((c) => c.status !== "paid").length;

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

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-hover rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-700">Upcoming Payments</p>
              <p className="mt-1 text-2xl font-extrabold text-amber-900">{formatRM(totalUpcoming)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100">
              <CalendarClock className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="card-hover rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-700">Overdue</p>
              <p className="mt-1 text-2xl font-extrabold text-rose-900">{formatRM(totalOverdue)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
          </div>
        </div>

        <div className="card-hover rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700">Paid</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-900">{formatRM(totalPaid)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="card-hover rounded-2xl border border-navy-200 bg-gradient-to-br from-navy-800 to-navy-950 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/70">Outstanding</p>
              <p className="mt-1 text-2xl font-extrabold text-white">{outstandingCount}</p>
              <p className="text-xs text-white/50">commitments</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <Receipt className="h-5 w-5 text-teal-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Due Dates strip */}
      {upcomingDueDates.length > 0 && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-bold text-navy-900">Upcoming Due Dates</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcomingDueDates.map((c) => {
              const days = daysUntil(c.dueDate);
              return (
                <div
                  key={c.id}
                  className={`min-w-[200px] rounded-xl border p-3 ${
                    c.status === "overdue" || days < 0
                      ? "border-rose-200 bg-rose-50"
                      : days <= 3
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500">{c.name}</p>
                  <p className="mt-1 text-lg font-bold text-navy-900">{formatRM(c.amount)}</p>
                  <p className={`mt-1 text-xs font-semibold ${
                    days < 0 ? "text-rose-600" : days <= 3 ? "text-amber-600" : "text-slate-500"
                  }`}>
                    {getRelativeTime(c.dueDate)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-navy-900">Payment List</h2>
          <span className="text-sm text-slate-400">({sortedCommitments.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {(["", "upcoming", "overdue", "paid"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all capitalize ${
                  filterStatus === s ? "bg-white text-navy-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {s === "" ? "All" : s}
              </button>
            ))}
          </div>
          <Button onClick={() => { setEditingId(null); setShowAddModal(true); }} icon={<Plus className="h-4 w-4" />}>
            Add
          </Button>
        </div>
      </div>

      {/* Commitments list */}
      <div className="space-y-3">
        {sortedCommitments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
            <Receipt className="mx-auto mb-3 h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">No commitments found</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => { setEditingId(null); setShowAddModal(true); }}
              icon={<Plus className="h-4 w-4" />}
            >
              Add your first commitment
            </Button>
          </div>
        ) : (
          sortedCommitments.map((c) => (
            <CommitmentItem
              key={c.id}
              commitment={c}
              onMarkPaid={() => markCommitmentPaid(c.id)}
              onEdit={() => { setEditingId(c.id); setShowAddModal(true); }}
            />
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      <CommitmentModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingId(null); }}
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

  const statusConfig = isPaid
    ? { label: "Paid", color: "bg-emerald-50 text-emerald-600", icon: CheckCircle2, borderColor: "border-emerald-200", bgColor: "bg-emerald-50/30" }
    : isOverdueStatus
    ? { label: "Overdue", color: "bg-rose-50 text-rose-600", icon: AlertTriangle, borderColor: "border-rose-200", bgColor: "bg-rose-50/30" }
    : { label: "Upcoming", color: "bg-amber-50 text-amber-600", icon: Clock, borderColor: "border-slate-200", bgColor: "bg-white" };

  const StatusIcon = statusConfig.icon;

  return (
    <div className={`rounded-2xl border p-4 transition-all hover:shadow-sm ${statusConfig.borderColor} ${statusConfig.bgColor}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Icon */}
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
          isPaid ? "bg-emerald-100" : isOverdueStatus ? "bg-rose-100" : "bg-amber-100"
        }`}>
          <StatusIcon className={`h-6 w-6 ${
            isPaid ? "text-emerald-600" : isOverdueStatus ? "text-rose-600" : "text-amber-600"
          }`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-navy-900">{commitment.name}</h3>
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            {commitment.recurring && (
              <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 sm:inline">
                Recurring
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(commitment.dueDate)}
            </span>
            <span className="flex items-center gap-1">
              <Receipt className="h-3.5 w-3.5" />
              {commitment.category}
            </span>
            {!isPaid && (
              <span className={`font-semibold ${
                isOverdueStatus ? "text-rose-600" : days <= 3 ? "text-amber-600" : "text-slate-500"
              }`}>
                {getRelativeTime(commitment.dueDate)}
              </span>
            )}
          </div>
        </div>

        {/* Amount + Actions */}
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="text-lg font-bold text-navy-900">{formatRM(commitment.amount)}</p>
          <div className="flex gap-1.5">
            {!isPaid && (
              <Button
                variant="success"
                size="sm"
                onClick={onMarkPaid}
                icon={<Check className="h-3.5 w-3.5" />}
              >
                Mark as Paid
              </Button>
            )}
            <button
              onClick={onEdit}
              className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-navy-700"
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
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
    if (!name.trim()) newErrors.name = "Name is required";
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      newErrors.amount = "Enter a valid amount";
    }
    if (!dueDate) newErrors.dueDate = "Due date is required";

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
    <Modal isOpen={isOpen} onClose={onClose} title={editingCommitment ? "Edit Commitment" : "Add Commitment"} size="md">
      <div className="space-y-4">
        <Input
          label="Payment Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Room Rent"
          error={errors.name}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount (RM)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            error={errors.amount}
          />
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </div>

        <Input
          label="Due Date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={errors.dueDate}
        />

        <Select
          label="Payment Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PaymentStatus)}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "paid", label: "Paid" },
            { value: "overdue", label: "Overdue" },
          ]}
        />

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <div>
            <span className="text-sm font-medium text-navy-900">Recurring payment</span>
            <p className="text-xs text-slate-400">This payment repeats monthly</p>
          </div>
        </label>

        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave} className="flex-1">
            {editingCommitment ? "Update" : "Add"} Commitment
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
