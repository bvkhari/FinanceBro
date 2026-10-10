"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { navItems } from "./nav";

// Desktop sidebar: a heavier material than the content, so it reads as structure.
export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="material sticky top-0 flex h-screen w-60 flex-col shadow-[inset_-0.5px_0_0_var(--separator)]">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-[0.6rem] bg-accent text-white">
          <Wallet className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </span>
        <span className="text-headline text-label">FinanceBro</span>
      </Link>

      <nav className="flex-1 px-3" aria-label="Main">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`press flex h-9 items-center gap-3 rounded-lg px-3 text-callout font-medium ${
                    isActive ? "bg-gray/16 text-label" : "text-label-2 hover:bg-gray/7"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] ${isActive ? "text-accent-text" : ""}`} strokeWidth={2} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="px-5 pb-5 text-caption text-label-3">DORMATHON 2026 · Track 2</p>
    </div>
  );
}
