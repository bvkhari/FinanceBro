import { LayoutGrid, Sparkles, ArrowLeftRight, CreditCard, CalendarClock } from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/financebro-ai", label: "FinanceBro AI", icon: Sparkles },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/debts", label: "Debts", icon: CreditCard },
  { href: "/commitments", label: "Commitments", icon: CalendarClock },
] as const;

export const pageTitles: Record<string, string> = Object.fromEntries(navItems.map((i) => [i.href, i.label]));
