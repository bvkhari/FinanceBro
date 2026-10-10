"use client";

import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  icon?: ReactNode;
  /** Drop the inner padding so inset-grouped rows can run edge to edge. */
  flush?: boolean;
}

// Inset-grouped section: the header sits outside the surface, like iOS Settings.
export function Card({ children, className = "", title, action, icon, flush }: CardProps) {
  return (
    <section className={`flex flex-col ${className}`}>
      {(title || action) && (
        <header className="mb-2 flex min-h-8 items-center justify-between gap-3 px-1">
          <h2 className="flex items-center gap-2 text-title3 text-label">
            {icon}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={`flex-1 overflow-hidden rounded-2xl bg-surface shadow-card ${flush ? "" : "p-4"}`}>
        {children}
      </div>
    </section>
  );
}
