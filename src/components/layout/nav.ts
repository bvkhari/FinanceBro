import { LayoutGrid, Sparkles, CreditCard, FileText } from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/payments", label: "PayLater", icon: CreditCard },
  { href: "/financebro-ai", label: "FinanceBro AI", icon: Sparkles },
  { href: "/reports", label: "Reports", icon: FileText },
] as const;

export const pageTitles: Record<string, string> = { ...Object.fromEntries(navItems.map((i) => [i.href, i.label])), "/agent": "WorkBuddy Agent" };
