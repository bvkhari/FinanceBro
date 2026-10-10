"use client";

import { useState, useMemo, useEffect } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { NewTransaction, Transaction, TransactionType } from "@/lib/types";
import { TRANSACTION_CATEGORIES, categoryColor } from "@/lib/categories";
import { DEBT_REPAYMENT, isSpending } from "@/lib/cashflow";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, TextArea } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatRM, formatDateShort, todayISO } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
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

  // "Where it went": spending by category, biggest first; the rest folds into "N more".
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions.filter(isSpending)) m.set(t.category, (m.get(t.category) || 0) + t.amount);
    return Array.from(m, ([category, amount]) => ({ category, amount, color: categoryColor(category) })).sort(
      (a, b) => b.amount - a.amount
    );
  }, [transactions]);

  // The dashboard's "Add" tile links here with ?new=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setEditingId(null);
      setShowAddModal(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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

  const row = (t: Transaction) => (
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
  );

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

      <WhereItWent
        className="mb-8"
        slices={byCategory}
        spent={totalExpenses}
        stats={[
          { label: "In", value: totalIncome, cls: "text-positive" },
          { label: "Out", value: totalExpenses, cls: "text-negative" },
          { label: "Net", value: net, cls: net >= 0 ? "text-label" : "text-negative" },
        ]}
      />

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
          dayGroups(filteredTransactions, sortBy).map((g) => (
            <section key={g.label || "all"} aria-label={g.label || undefined}>
              {g.label && (
                <h3 className="px-4 pb-1 pt-3 text-caption font-semibold uppercase tracking-[0.08em] text-label-2 [&:not(:first-child)]:shadow-[inset_0_0.5px_0_var(--separator)]">
                  {g.label}
                </h3>
              )}
              <ul className="grouped-inset" style={{ ["--inset" as string]: "3.75rem" }}>
                {g.items.map(row)}
              </ul>
            </section>
          ))
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

/** Day headers ("MON, 5 OCT 2026") when the list is sorted by date; one unlabelled group otherwise. */
function dayGroups(list: Transaction[], sort: Sort): { label: string; items: Transaction[] }[] {
  if (!sort.startsWith("date")) return [{ label: "", items: list }];
  const groups: { label: string; items: Transaction[] }[] = [];
  for (const t of list) {
    const label = new Date(`${t.date}T00:00:00`).toLocaleDateString("en-MY", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }
  return groups;
}

function WhereItWent({
  slices,
  spent,
  stats,
  className = "",
}: {
  slices: { category: string; amount: number; color: string }[];
  spent: number;
  stats: { label: string; value: number; cls: string }[];
  className?: string;
}) {
  const top = slices.slice(0, 3);
  const rest = slices.slice(3);
  const pct = (n: number) => (spent > 0 ? Math.round((n / spent) * 100) : 0);
  return (
    <section className={`rounded-2xl bg-surface p-4 shadow-card ${className}`} aria-label="Where it went">
      <p className="text-subhead font-medium text-label-2">Where it went</p>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          {slices.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="amount" nameKey="category" innerRadius="80%" outerRadius="100%" paddingAngle={1.5} stroke="none" cornerRadius={4} isAnimationActive={false}>
                  {slices.map((s) => (
                    <Cell key={s.category} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-caption font-semibold uppercase tracking-[0.1em] text-label-2">Spent</p>
            <p className="tabular text-subhead font-semibold">{formatRM(spent)}</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {slices.length === 0 && <li className="text-subhead text-label-2">No spending yet.</li>}
          {top.map((s) => (
            <li key={s.category} className="flex items-center gap-2 text-subhead">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.category}</span>
              <span className="tabular ml-auto text-label-2">{pct(s.amount)}%</span>
            </li>
          ))}
          {rest.length > 0 && (
            <li className="flex items-center gap-2 text-subhead text-label-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-gray/40" />
              <span className="truncate">{rest.length} more</span>
              <span className="tabular ml-auto">{pct(rest.reduce((n, s) => n + s.amount, 0))}%</span>
            </li>
          )}
        </ul>
      </div>
      <dl className="mt-4 grid grid-cols-3 pt-3 text-center shadow-[inset_0_0.5px_0_var(--separator)]">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-caption font-semibold uppercase tracking-[0.1em] text-label-2">{s.label}</dt>
            <dd className={`tabular mt-0.5 whitespace-nowrap text-subhead font-semibold sm:text-headline ${s.cls}`}>{formatRM(s.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
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
