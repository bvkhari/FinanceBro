import { LayoutGrid, Sparkles, ArrowLeftRight, CreditCard, FileText } from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/financebro-ai", label: "FinanceBro AI", icon: Sparkles },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: FileText },
] as const;

export const pageTitles: Record<string, string> = { ...Object.fromEntries(navItems.map((i) => [i.href, i.label])), "/agent": "WorkBuddy Agent" };
