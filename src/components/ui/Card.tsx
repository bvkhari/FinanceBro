"use client";

import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function Card({ children, className = "", title, action, icon }: CardProps) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-bold text-navy-900">{title}</h3>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
