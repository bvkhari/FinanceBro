"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  Wallet,
  X,
  RotateCcw,
} from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/financebro-ai", label: "FinanceBro AI", icon: Bot },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/debts", label: "Debts", icon: CreditCard },
  { href: "/commitments", label: "Commitments", icon: CalendarClock },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { resetData } = useFinance();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="flex h-screen w-72 flex-col bg-navy-900 text-white">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3" onClick={onClose}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-extrabold tracking-tight">FinanceBro</span>
            <span className="text-xs font-medium text-teal-400">AI Copilot</span>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-navy-200 hover:bg-navy-800 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-navy-400">
          Menu
        </p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-teal-500/10 text-teal-300"
                      : "text-navy-200 hover:bg-navy-800 hover:text-white"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-teal-400" : ""}`} />
                  {item.label}
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-400" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: DORMATHON badge + Reset */}
      <div className="border-t border-navy-800 px-4 py-4">
        <div className="mb-3 rounded-xl bg-navy-800/50 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
              <span className="text-xs font-bold">D</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-white">DORMATHON 2026</p>
              <p className="text-[10px] text-navy-400">Track 2: WorkBuddy</p>
            </div>
          </div>
        </div>

        {showResetConfirm ? (
          <div className="space-y-2 rounded-xl bg-navy-800/50 p-3">
            <p className="text-xs text-navy-200">Reload data from Supabase?</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  resetData();
                  setShowResetConfirm(false);
                }}
                className="flex-1 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Reload
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-medium text-navy-200 hover:bg-navy-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-navy-300 hover:bg-navy-800 hover:text-white transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reload Data
          </button>
        )}
      </div>
    </div>
  );
}
