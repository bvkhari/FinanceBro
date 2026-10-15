import { redirect } from "next/navigation";

// FinanceBro tracks PayLater debts only; there is no expense ledger any more.
export default function TransactionsRedirect() {
  redirect("/");
}
