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
}

const variantStyles = {
  default: {
    card: "bg-white border-slate-200",
    icon: "bg-slate-100 text-slate-600",
    value: "text-navy-900",
  },
  income: {
    card: "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200",
    icon: "bg-emerald-100 text-emerald-600",
    value: "text-emerald-900",
  },
  expense: {
    card: "bg-gradient-to-br from-rose-50 to-red-50 border-rose-200",
    icon: "bg-rose-100 text-rose-600",
    value: "text-rose-900",
  },
  warning: {
    card: "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200",
    icon: "bg-amber-100 text-amber-600",
    value: "text-amber-900",
  },
  accent: {
    card: "bg-gradient-to-br from-teal-600 to-teal-700 border-teal-700 text-white",
    icon: "bg-teal-500/30 text-teal-100",
    value: "text-white",
  },
  navy: {
    card: "bg-gradient-to-br from-navy-800 to-navy-950 border-navy-900 text-white",
    icon: "bg-navy-700/50 text-teal-300",
    value: "text-white",
  },
};

export function StatCard({ label, value, icon: Icon, variant = "default", subtitle, trend }: StatCardProps) {
  const styles = variantStyles[variant];
  const isDark = variant === "accent" || variant === "navy";

  return (
    <div className={`card-hover rounded-2xl border p-5 ${styles.card}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-xs font-medium ${isDark ? "text-white/70" : "text-slate-500"}`}>
            {label}
          </p>
          <p className={`mt-2 text-2xl font-extrabold ${styles.value}`}>
            {formatRM(value)}
          </p>
          {subtitle && (
            <p className={`mt-1 text-xs ${isDark ? "text-white/60" : "text-slate-400"}`}>
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <span
                className={`text-xs font-semibold ${
                  trend.isPositive ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              <span className={`text-xs ${isDark ? "text-white/50" : "text-slate-400"}`}>
                vs last month
              </span>
            </div>
          )}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
