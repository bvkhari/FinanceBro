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
