"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./nav";

// iOS tab bar for phones and tablets. Content scrolls under the material.
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="material material-edge-t fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-[3.25rem] max-w-lg grid-cols-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`press flex h-full flex-col items-center justify-center gap-0.5 ${
                  isActive ? "text-accent-text" : "text-label-2"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.25 : 1.9} />
                <span className="text-[0.625rem] font-medium tracking-[0.01em]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
