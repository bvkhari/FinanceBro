"use client";

import { useState, useMemo, useEffect } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { Transaction, TransactionType } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, TextArea } from "@/components/ui/Input";
import { formatRM, formatDateShort, todayISO } from "@/lib/utils";
import {
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  Filter,
  X,
  ArrowUpDown,
  Receipt,
  Wallet,
  Tag,
} from "lucide-react";

const INDIVIDUAL_CATEGORIES = [
  "Food",
  "Transportation",
  "Shopping",
  "Education",
  "Entertainment",
  "Subscriptions",
  "Rent",
  "Utilities",
  "Allowance",
  "Salary",
  "Part-time income",
  "Uncategorised",
  "Other",
];

const BUSINESS_CATEGORIES = [
  "Sales Revenue",
  "Delivery Sales",
  "Service Income",
  "Other Business Income",
  "Ingredients",
  "Packaging",
  "Wages",
  "Supplies",
  "Operating Expenses",
  "Utilities",
  "Rent",
  "Marketing",
  "Uncategorised",
  "Other",
];

export default function TransactionsPage() {
  const { mode, transactions, addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState("");
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc">("date-desc");

  const categories = mode === "individual" ? INDIVIDUAL_CATEGORIES : BUSINESS_CATEGORIES;

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

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

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card-hover rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700">Total Income</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-900">{formatRM(totalIncome)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="card-hover rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-700">Total Expenses</p>
              <p className="mt-1 text-2xl font-extrabold text-rose-900">{formatRM(totalExpenses)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100">
              <TrendingDown className="h-5 w-5 text-rose-600" />
            </div>
          </div>
        </div>

        <div className="card-hover rounded-2xl border border-navy-200 bg-gradient-to-br from-navy-800 to-navy-950 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/70">Net Balance</p>
              <p className={`mt-1 text-2xl font-extrabold ${totalIncome - totalExpenses >= 0 ? "text-teal-300" : "text-rose-300"}`}>
                {formatRM(totalIncome - totalExpenses)}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <Wallet className="h-5 w-5 text-teal-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-navy-900">
          All Transactions
          <span className="ml-2 text-sm font-normal text-slate-400">
            ({filteredTransactions.length} {filteredTransactions.length === 1 ? "item" : "items"})
          </span>
        </h2>
        <Button onClick={() => { setEditingId(null); setShowAddModal(true); }} icon={<Plus className="h-4 w-4" />}>
          Add Transaction
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-navy-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-navy-900 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">All Categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-navy-900 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-navy-900 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
            <option value="amount-asc">Lowest Amount</option>
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Transaction Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Transaction</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Category</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Type</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Amount</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Receipt className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          t.type === "income" ? "bg-emerald-100" : "bg-rose-100"
                        }`}>
                          {t.type === "income" ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-rose-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-navy-900">{t.name}</p>
                          {t.description && (
                            <p className="text-xs text-slate-400 truncate max-w-[200px]">{t.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatDateShort(t.date)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        t.type === "income"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-rose-50 text-rose-600"
                      }`}>
                        {t.type === "income" ? "Income" : "Expense"}
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-right font-bold ${t.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                      {t.type === "income" ? "+" : "-"}{formatRM(t.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setEditingId(t.id); setShowAddModal(true); }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy-700"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteTransaction(t.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-50 md:hidden">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Receipt className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              No transactions found
            </div>
          ) : (
            filteredTransactions.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    t.type === "income" ? "bg-emerald-100" : "bg-rose-100"
                  }`}>
                    {t.type === "income" ? (
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-rose-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-900 truncate">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.category} · {formatDateShort(t.date)}</p>
                  </div>
                  <p className={`font-bold ${t.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                    {t.type === "income" ? "+" : "-"}{formatRM(t.amount)}
                  </p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => { setEditingId(t.id); setShowAddModal(true); }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-navy-700"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <TransactionModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingId(null); }}
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
      />
    </div>
  );
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  editingTransaction: Transaction | null;
  onSave: (data: Omit<Transaction, "id" | "createdAt" | "mode">) => void;
}

function TransactionModal({ isOpen, onClose, categories, editingTransaction, onSave }: TransactionModalProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [category, setCategory] = useState(categories[0] || "Food");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

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
  }, [editingTransaction, isOpen]);

  const handleSave = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Name is required";
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      newErrors.amount = "Enter a valid amount";
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
    <Modal isOpen={isOpen} onClose={onClose} title={editingTransaction ? "Edit Transaction" : "Add Transaction"} size="md">
      <div className="space-y-4">
        {/* Type Toggle */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => setType("expense")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
              type === "expense" ? "bg-rose-500 text-white shadow-sm" : "text-slate-500"
            }`}
          >
            <TrendingDown className="h-4 w-4" /> Expense
          </button>
          <button
            onClick={() => setType("income")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
              type === "income" ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500"
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Income
          </button>
        </div>

        <Input
          label="Transaction Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Grocery Shopping"
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
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <TextArea
          label="Description (Optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a note..."
        />

        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave} className="flex-1">
            {editingTransaction ? "Update" : "Add"} Transaction
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
