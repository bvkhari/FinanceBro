"use client";

import { usePathname } from "next/navigation";
import { Bell, RotateCcw } from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { useCallback, useEffect, useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { pageTitles } from "./nav";

const dotColor = { warning: "bg-warning", success: "bg-positive", info: "bg-info" } as const;

export function TopNav() {
  const pathname = usePathname();
  const { profile, notifications, unreadCount, markNotificationRead, resetData } = useFinance();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // The page's large title scrolls away; the compact title fades into the bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 44);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  const closeNotifs = useCallback(() => setShowNotifs(false), []);
  const closeProfile = useCallback(() => setShowProfile(false), []);

  const title = pageTitles[pathname] || "Dashboard";
  const initial = profile.displayName.charAt(0);

  return (
    <header
      className={`material sticky top-0 z-30 print:hidden transition-shadow duration-200 ${scrolled ? "material-edge-b" : ""}`}
    >
      <div className="flex h-[var(--topbar-h)] items-center justify-between gap-3 px-4 sm:px-6">
        <p
          className={`truncate text-headline text-label transition-[opacity,transform] duration-300 ease-out ${
            scrolled ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
          aria-hidden={!scrolled}
        >
          {title}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <Popover
            open={showNotifs}
            onClose={closeNotifs}
            className="w-80"
            trigger={
              <button
                onClick={() => setShowNotifs((v) => !v)}
                className="press relative flex h-9 w-9 items-center justify-center rounded-full text-label-2 hover:bg-gray/10"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                aria-expanded={showNotifs}
              >
                <Bell className="h-5 w-5" strokeWidth={2} />
                {unreadCount > 0 && (
                  <span className="tabular absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[0.625rem] font-semibold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            }
          >
            <div className="flex items-baseline justify-between px-4 pb-2 pt-3.5">
              <h3 className="text-headline">Notifications</h3>
              {unreadCount > 0 && <span className="text-footnote text-label-2">{unreadCount} unread</span>}
            </div>
            <p className="px-4 pb-2 text-footnote text-label-3">In-app reminders only. Nothing is sent by email, SMS or push.</p>
            <div className="grouped-inset max-h-80 overflow-y-auto pb-1" style={{ ["--inset" as string]: "2.25rem" }}>
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-subhead text-label-2">You're all caught up.</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className="row-press flex w-full gap-3 px-4 py-2.5 text-left"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : dotColor[n.type]}`} />
                    <span className="min-w-0">
                      <span className={`block text-subhead ${n.read ? "text-label-2" : "font-semibold text-label"}`}>{n.title}</span>
                      <span className="block text-footnote text-label-2">{n.message}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </Popover>

          <Popover
            open={showProfile}
            onClose={closeProfile}
            className="w-72"
            trigger={
              <button
                onClick={() => setShowProfile((v) => !v)}
                className="press flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-[rgb(142_142_147)] to-[rgb(99_99_102)] text-subhead font-semibold text-white"
                aria-label="Profile"
                aria-expanded={showProfile}
              >
                {initial}
              </button>
            }
          >
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[rgb(142_142_147)] to-[rgb(99_99_102)] text-title3 text-white">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-headline">{profile.displayName}</p>
                <p className="text-footnote text-label-2">{profile.accountType}</p>
              </div>
            </div>
            <dl className="grouped mx-3 rounded-xl bg-gray/7 text-subhead">
              {[
                ["Tracking", "PayLater (BNPL)"],
                ["Currency", profile.currency],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-3 py-2.5">
                  <dt className="text-label-2">{k}</dt>
                  <dd className="tabular font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="p-3">
              <button
                onClick={() => {
                  resetData();
                  closeProfile();
                }}
                className="row-press flex h-9 w-full items-center gap-2 rounded-lg px-3 text-subhead font-medium text-accent-text"
              >
                <RotateCcw className="h-4 w-4" />
                Reload data
              </button>
              <p className="px-3 pt-2 text-caption text-label-3">Demo account. No sign-in needed.</p>
            </div>
          </Popover>
        </div>
      </div>
    </header>
  );
}
