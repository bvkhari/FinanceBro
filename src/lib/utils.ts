// ============================================================
// Utility functions used throughout the application
// ============================================================

/** Format a number as Malaysian Ringgit */
export function formatRM(amount: number, options?: { decimals?: number }): string {
  const decimals = options?.decimals ?? 2;
  // Negatives read "−RM 1,350.00", like the amounts the pages prefix with "−" themselves.
  return `${amount < 0 ? "−" : ""}RM ${Math.abs(amount).toLocaleString("en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Format a compact RM amount (e.g. RM1.2k) */
export function formatRMCompact(amount: number): string {
  if (amount >= 1000) {
    return `RM ${(amount / 1000).toFixed(1)}k`;
  }
  return `RM ${amount.toFixed(0)}`;
}

/** Format a date string to readable format */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format a short date (e.g. "Oct 15") */
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
  });
}

/** Get relative time (e.g. "3 days ago") */
export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""} overdue`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `In ${diffDays} days`;
}

/** Check if a date is overdue */
export function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

/** Today's date as YYYY-MM-DD in the user's local time zone (not UTC). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Generate a unique ID */
export function genId(prefix: string = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Get days until a date */
export function daysUntil(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
