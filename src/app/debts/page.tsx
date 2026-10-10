import { redirect } from "next/navigation";

// Debts and bills now live together on /payments.
export default function DebtsRedirect({ searchParams }: { searchParams: Record<string, string> }) {
  const q = new URLSearchParams(searchParams);
  if (q.get("tab") === "debts") q.delete("tab");
  redirect(`/payments${q.toString() ? `?${q}` : ""}`);
}
