"use client";

import { useState, useMemo, useEffect } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { NewTransaction, Transaction, TransactionType } from "@/lib/types";
import { TRANSACTION_CATEGORIES } from "@/lib/categories";
import { DEBT_REPAYMENT, isSpending } from "@/lib/cashflow";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, TextArea } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatRM, formatDateShort, todayISO } from "@/lib/utils";
import { Plus, Search, TrendingUp, TrendingDown, X, ChevronRight, ChevronDown, Trash2 } from "lucide-react";


type Sort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export default function TransactionsPage() {
  const { mode, transactions, addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState<"" | TransactionType>("");
  const [sortBy, setSortBy] = useState<Sort>("date-desc");

  const categories = TRANSACTION_CATEGORIES[mode];

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  // Debt repayments aren't spending (the purchase was already counted); purchases on credit are.
  const totalExpenses = transactions.filter(isSpending).reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpenses;

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(lower) ||
          t.category.toLowerCase().includes(lower) ||
          (t.description?.toLowerCase().includes(lower))
      );
    }

    if (filterCategory) {
      result = result.filter((t) => t.category === filterCategory);
    }

    if (filterType) {
      result = result.filter((t) => t.type === filterType);
    }

    switch (sortBy) {
      case "date-desc":
        result.sort((a, b) => b.date.localeCompare(a.date));
        break;
      case "date-asc":
        result.sort((a, b) => a.date.localeCompare(b.date));
        break;
      case "amount-desc":
        result.sort((a, b) => b.amount - a.amount);
        break;
      case "amount-asc":
        result.sort((a, b) => a.amount - b.amount);
        break;
    }

    return result;
  }, [transactions, search, filterCategory, filterType, sortBy]);

  const availableCategories = useMemo(() => {
    const set = new Set(transactions.map((t) => t.category));
    return Array.from(set).sort();
  }, [transactions]);

  const hasFilters = search || filterCategory || filterType;

  const clearFilters = () => {
    setSearch("");
    setFilterCategory("");
    setFilterType("");
  };

  const openNew = () => {
    setEditingId(null);
    setShowAddModal(true);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <PageHeader
        title="Transactions"
        subtitle={`${transactions.length} ${mode === "individual" ? "personal" : "business"} records`}
        accessory={
          <Button onClick={openNew} icon={<Plus className="h-4 w-4" strokeWidth={2.5} />} className="max-sm:w-full">
            Add transaction
          </Button>
        }
      />

      {/* Totals: one grouped surface, three columns */}
      <div className="mb-8 grid grid-cols-3 divide-x divide-[color:var(--separator)] rounded-2xl bg-surface py-4 shadow-card">
        {[
          { label: "Income", value: totalIncome, cls: "text-positive" },
          { label: "Expenses", value: totalExpenses, cls: "text-label" },
          { label: "Net", value: net, cls: net >= 0 ? "text-label" : "text-negative" },
        ].map((s) => (
          <div key={s.label} className="px-3 text-center sm:px-5 sm:text-left">
            <p className="text-footnote text-label-2">{s.label}</p>
            <p className={`tabular mt-1 whitespace-nowrap text-subhead font-semibold sm:text-title3 ${s.cls}`}>{formatRM(s.value)}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mb-3 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label-3" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search transactions"
            className="h-10 w-full rounded-xl bg-gray/12 pl-9 pr-9 text-body text-label outline-none placeholder:text-label-3 focus:shadow-[0_0_0_3px_rgb(var(--accent)/0.35)] [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-gray/40 text-surface"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="Type"
            size="sm"
            className="w-full sm:w-64"
            value={filterType || "all"}
            onChange={(v) => setFilterType(v === "all" ? "" : v)}
            options={[
              { value: "all", label: "All" },
              { value: "income", label: "Income" },
              { value: "expense", label: "Expenses" },
            ]}
          />
          <PillSelect
            label="Category"
            value={filterCategory}
            onChange={setFilterCategory}
            options={[{ value: "", label: "All categories" }, ...availableCategories.map((c) => ({ value: c, label: c }))]}
          />
          <PillSelect
            label="Sort"
            value={sortBy}
            onChange={(v) => setSortBy(v as Sort)}
            options={[
              { value: "date-desc", label: "Newest first" },
              { value: "date-asc", label: "Oldest first" },
              { value: "amount-desc", label: "Largest first" },
              { value: "amount-asc", label: "Smallest first" },
            ]}
          />
          {hasFilters && (
            <button onClick={clearFilters} className="press h-7 rounded-full px-2 text-footnote font-medium text-accent-text">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <p className="mb-2 px-1 text-footnote text-label-2">
        {filteredTransactions.length} {filteredTransactions.length === 1 ? "result" : "results"}
      </p>

      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        {filteredTransactions.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-headline">No transactions</p>
            <p className="mt-1 text-subhead text-label-2">
              {hasFilters ? "Nothing matches these filters." : "Add your first one to start tracking."}
            </p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={hasFilters ? clearFilters : openNew}>
              {hasFilters ? "Clear filters" : "Add transaction"}
            </Button>
          </div>
        ) : (
          <ul className="grouped-inset" style={{ ["--inset" as string]: "3.75rem" }}>
            {filteredTransactions.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => {
                    setEditingId(t.id);
                    setShowAddModal(true);
                  }}
                  className="row-press flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      t.type === "income" ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative"
                    }`}
                  >
                    {t.type === "income" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-label">{t.name}</span>
                    <span className="block truncate text-footnote text-label-2">
                      {t.category} · {formatDateShort(t.date)}
                      {!t.cashEffect && (
                        <span className="ml-1.5 rounded-full bg-info/12 px-1.5 py-px text-caption font-medium text-info" title="Bought on credit: counts as spending, but no cash has left your account yet">
                          On credit
                        </span>
                      )}
                      {t.category === DEBT_REPAYMENT && (
                        <span className="ml-1.5 rounded-full bg-gray/12 px-1.5 py-px text-caption font-medium text-label-2" title="Cash paid towards a debt. The purchase was counted as spending when it was made.">
                          Not spending
                        </span>
                      )}
                      {t.description ? <span className="hidden md:inline"> · {t.description}</span> : null}
                    </span>
                  </span>
                  <span className={`tabular text-body font-medium ${t.type === "income" ? "text-positive" : "text-label"}`}>
                    {t.type === "income" ? "+" : "−"}
                    {formatRM(t.amount)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-label-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TransactionModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingId(null);
        }}
        categories={categories}
        editingTransaction={editingId ? transactions.find((t) => t.id === editingId) ?? null : null}
        onSave={(data) => {
          if (editingId) {
            updateTransaction(editingId, data);
          } else {
            addTransaction(data);
          }
          setShowAddModal(false);
          setEditingId(null);
        }}
        onDelete={(id) => {
          deleteTransaction(id);
          setShowAddModal(false);
          setEditingId(null);
        }}
      />
    </div>
  );
}

function PillSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = options.find((o) => o.value === value) ?? options[0];
  return (
    <label className="press relative flex h-7 cursor-pointer items-center gap-1 rounded-full bg-gray/12 pl-3 pr-2 text-footnote font-medium text-label">
      <span className="sr-only">{label}</span>
      {active.label}
      <ChevronDown className="h-3.5 w-3.5 text-label-2" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  editingTransaction: Transaction | null;
  onSave: (data: NewTransaction) => void;
  onDelete: (id: string) => void;
}

function TransactionModal({ isOpen, onClose, categories, editingTransaction, onSave, onDelete }: TransactionModalProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState(categories[0] || "Food");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (editingTransaction) {
      setName(editingTransaction.name);
      setAmount(editingTransaction.amount.toString());
      setType(editingTransaction.type);
      setCategory(editingTransaction.category);
      setDate(editingTransaction.date);
      setDescription(editingTransaction.description || "");
    } else {
      setName("");
      setAmount("");
      setType("expense");
      setCategory(categories[0] || "Food");
      setDate(todayISO());
      setDescription("");
    }
    setErrors({});
    setConfirmDelete(false);
  }, [editingTransaction, isOpen]);

  const handleSave = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Give it a name.";
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      newErrors.amount = "Enter an amount above zero.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      name: name.trim(),
      amount: parsedAmount,
      type,
      category,
      date,
      description: description.trim() || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingTransaction ? "Edit transaction" : "New transaction"} size="md">
      <div className="space-y-4">
        <Segmented
          aria-label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
          ]}
        />

        {/* Amount first: it's the one thing every entry needs */}
        <div className="rounded-2xl bg-gray/7 px-4 py-3">
          <label htmlFor="tx-amount" className="text-footnote font-medium text-label-2">Amount</label>
          <div className="flex items-baseline gap-2">
            <span className="text-title2 text-label-3">RM</span>
            <input
              id="tx-amount"
              inputMode="decimal"
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (errors.amount) setErrors((er) => ({ ...er, amount: "" }));
              }}
              placeholder="0.00"
              className={`tabular w-full bg-transparent text-title1 outline-none placeholder:text-label-3 ${
                type === "income" ? "text-positive" : "text-label"
              }`}
            />
          </div>
          {errors.amount && <p className="text-footnote text-negative">{errors.amount}</p>}
        </div>

        <Input
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((er) => ({ ...er, name: "" }));
          }}
          placeholder="e.g. Groceries at Jaya Grocer"
          error={errors.name}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <TextArea
          label="Note"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />

        <Button variant="primary" size="lg" onClick={handleSave} className="w-full">
          {editingTransaction ? "Save changes" : "Add transaction"}
        </Button>

        {editingTransaction &&
          (confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
                Keep it
              </Button>
              <button
                onClick={() => onDelete(editingTransaction.id)}
                className="press h-10 flex-1 rounded-xl bg-negative text-headline text-white"
              >
                Delete
              </button>
            </div>
          ) : (
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              icon={<Trash2 className="h-4 w-4" />}
              className="w-full"
            >
              Delete transaction
            </Button>
          ))}
      </div>
    </Modal>
  );
}
