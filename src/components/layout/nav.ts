import { LayoutGrid, Sparkles, ArrowLeftRight, CalendarClock } from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/financebro-ai", label: "FinanceBro AI", icon: Sparkles },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/commitments", label: "Commitments", icon: CalendarClock },
] as const;

export const pageTitles: Record<string, string> = Object.fromEntries(navItems.map((i) => [i.href, i.label]));
