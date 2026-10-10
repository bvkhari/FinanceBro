import { AppMode } from "./types";

/** Categories offered when adding a transaction, per profile. */
export const TRANSACTION_CATEGORIES: Record<AppMode, string[]> = {
  individual: [
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
  ],
  business: [
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
  ],
};

const INCOME_CATEGORIES = new Set([
  "Allowance", "Salary", "Part-time income", "Sales Revenue", "Delivery Sales", "Service Income", "Other Business Income",
]);

/** Expense categories only: what a purchase on credit can be filed under. */
export const spendingCategories = (mode: AppMode) => TRANSACTION_CATEGORIES[mode].filter((c) => !INCOME_CATEGORIES.has(c));

/** Chart colour for a transaction category. */
export function categoryColor(category: string): string {
  const colors: Record<string, string> = {
    Food: "#0d9488",
    Transportation: "#3b82f6",
    Shopping: "#a855f7",
    Education: "#f59e0b",
    Entertainment: "#ec4899",
    Subscriptions: "#8b5cf6",
    Rent: "#ef4444",
    Internet: "#6366f1",
    Utilities: "#14b8a6",
    Instalments: "#f97316",
    Allowance: "#10b981",
    Salary: "#059669",
    "Part-time income": "#22c55e",
    "Sales Revenue": "#0ea5e9",
    "Delivery Sales": "#38bdf8",
    "Service Income": "#06b6d4",
    "Other Business Income": "#6366f1",
    Ingredients: "#0d9488",
    Packaging: "#f59e0b",
    Wages: "#3b82f6",
    Supplies: "#f59e0b",
    "Operating Expenses": "#ef4444",
    Marketing: "#a855f7",
    "Business Rent": "#dc2626",
    "Supplier Payments": "#f97316",
    "Other Business Bills": "#64748b",
    Uncategorised: "#94a3b8",
  };
  return colors[category] || "#64748b";
}
