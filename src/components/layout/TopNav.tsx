"use client";

import { usePathname } from "next/navigation";
import { Menu, Bell, User, ChevronDown } from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { useState, useRef, useEffect } from "react";
import { formatRM } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/financebro-ai": "FinanceBro AI",
  "/transactions": "Transactions",
  "/commitments": "Commitments",
};

export function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { mode, setMode, profile, notifications, unreadCount, markNotificationRead } = useFinance();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const title = pageTitles[pathname] || "Dashboard";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Left: hamburger + page title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 text-navy-700 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-navy-900 sm:text-xl">{title}</h1>
            <span className="hidden rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 sm:inline">
              Demo Preview
            </span>
          </div>
        </div>

        {/* Right: mode switch, notifications, profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mode Switch */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => setMode("individual")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
                mode === "individual"
                  ? "bg-white text-navy-900 shadow-sm"
                  : "text-slate-500 hover:text-navy-700"
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setMode("business")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
                mode === "business"
                  ? "bg-white text-navy-900 shadow-sm"
                  : "text-slate-500 hover:text-navy-700"
              }`}
            >
              Business
            </button>
          </div>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="relative rounded-lg p-2 text-navy-700 hover:bg-slate-100"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-xl animate-slide-up">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-bold text-navy-900">Notifications</h3>
                  <span className="text-xs text-slate-400">{unreadCount} unread</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">
                      No notifications
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`flex w-full flex-col gap-1 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                          !n.read ? "bg-teal-50/40" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              n.type === "warning"
                                ? "bg-amber-500"
                                : n.type === "success"
                                ? "bg-emerald-500"
                                : "bg-blue-500"
                            }`}
                          />
                          <span className="text-sm font-semibold text-navy-900">{n.title}</span>
                          {!n.read && (
                            <span className="ml-auto h-2 w-2 rounded-full bg-teal-500" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 py-1 pl-1 pr-2 hover:bg-slate-50 sm:pr-3"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-navy-700 to-navy-900 text-sm font-bold text-white">
                {profile.displayName.charAt(0)}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold text-navy-900">{profile.displayName}</p>
                <p className="text-[10px] text-slate-400">{profile.accountType}</p>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>

            {showProfile && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-slide-up">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-navy-700 to-navy-900 text-lg font-bold text-white">
                    {profile.displayName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy-900">{profile.displayName}</p>
                    <p className="text-xs text-slate-400">{profile.accountType}</p>
                  </div>
                </div>
                <div className="space-y-2 pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mode</span>
                    <span className="font-medium capitalize text-navy-900">{mode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Monthly Budget</span>
                    <span className="font-medium text-navy-900">{formatRM(profile.monthlyBudget)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Currency</span>
                    <span className="font-medium text-navy-900">{profile.currency}</span>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xs text-slate-400">Demo user — no login required</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
