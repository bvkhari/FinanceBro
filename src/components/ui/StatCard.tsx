"use client";

import { LucideIcon } from "lucide-react";
import { formatRM } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  variant?: "default" | "income" | "expense" | "warning" | "accent" | "navy";
  subtitle?: string;
  trend?: { value: number; isPositive: boolean };
  /** Show the raw number instead of an RM amount (e.g. a count). */
  plain?: boolean;
}

// Color lives in the small glyph and, for signed figures, the number itself.
// The surface stays neutral so a row of cards reads as one group.
const tint = {
  default: "text-label-2 bg-gray/12",
  income: "text-positive bg-positive/12",
  expense: "text-negative bg-negative/12",
  warning: "text-warning bg-warning/12",
  accent: "text-accent-text bg-accent/12",
  navy: "text-info bg-info/12",
};

export function StatCard({ label, value, icon: Icon, variant = "default", subtitle, trend, plain }: StatCardProps) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint[variant]}`}>
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <p className="text-subhead font-medium text-label-2">{label}</p>
      </div>
      <p
        className={`tabular mt-3 text-title2 ${
          value < 0 ? "text-negative" : "text-label"
        }`}
      >
        {plain ? value : formatRM(value)}
      </p>
      {subtitle && <p className="mt-0.5 text-footnote text-label-2">{subtitle}</p>}
      {trend && (
        <p className={`mt-1 text-footnote font-semibold ${trend.isPositive ? "text-positive" : "text-negative"}`}>
          {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}% <span className="font-normal text-label-2">vs last month</span>
        </p>
      )}
    </div>
  );
}
