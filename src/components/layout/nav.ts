import { LayoutGrid, Sparkles, ArrowLeftRight, CreditCard } from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/financebro-ai", label: "FinanceBro AI", icon: Sparkles },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/payments", label: "Payments", icon: CreditCard },
] as const;

export const pageTitles: Record<string, string> = Object.fromEntries(navItems.map((i) => [i.href, i.label]));
