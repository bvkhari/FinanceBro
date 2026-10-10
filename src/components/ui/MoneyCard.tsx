"use client";

import { ReactNode } from "react";
import { formatRM } from "@/lib/utils";

interface MoneyCardProps {
  /** Small caps label above the hero number, e.g. "Balance". */
  label: string;
  value: number;
  /** Top-right tag, e.g. the profile name. */
  tag?: string;
  /** Up to three small figures along the bottom edge. */
  stats?: { label: string; value: number; tone?: "positive" | "negative" }[];
  /** A line under the hero number. */
  caption?: ReactNode;
  className?: string;
}

/** Splits RM 4,122.60 into "4,122" and ".60" so the cents can sit smaller. */
function splitAmount(n: number) {
  const s = formatRM(Math.abs(n)).replace(/^RM\s?/, "");
  const dot = s.lastIndexOf(".");
  return dot === -1 ? [s, ""] : [s.slice(0, dot), s.slice(dot)];
}

// A dark "bank card" hero: one big number, quiet stats underneath.
export function MoneyCard({ label, value, tag, stats, caption, className = "" }: MoneyCardProps) {
  const [whole, cents] = splitAmount(value);
  return (
    <section className={`ink-card relative overflow-hidden rounded-3xl p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-white/55">{label}</p>
        {tag && <p className="text-caption font-semibold uppercase tracking-[0.18em] text-white/40">{tag}</p>}
      </div>
      <p className="tabular mt-2 flex items-baseline">
        <span className="mr-1.5 text-headline text-white/70">{value < 0 ? "−RM" : "RM"}</span>
        <span className="text-[2.5rem] font-bold leading-none tracking-[-0.03em]">{whole}</span>
        <span className="text-title3 text-white/70">{cents}</span>
      </p>
      {caption && <p className="mt-2 text-subhead text-white/60">{caption}</p>}
      {stats && stats.length > 0 && (
        <dl className="mt-6 flex gap-6">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-caption font-semibold uppercase tracking-[0.12em] text-white/45">{s.label}</dt>
              <dd
                className={`tabular mt-0.5 truncate text-subhead font-semibold ${
                  s.tone === "negative" ? "text-negative" : s.tone === "positive" ? "text-positive" : "text-white"
                }`}
              >
                {formatRM(s.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
