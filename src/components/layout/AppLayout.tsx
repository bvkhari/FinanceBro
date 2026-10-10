"use client";

import React from "react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { TabBar } from "./TabBar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:block">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="flex-1 pb-[var(--tabbar-h)]">{children}</main>
      </div>

      <TabBar />
    </div>
  );
}
