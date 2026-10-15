import { redirect } from "next/navigation";

// Bills were dropped; FinanceBro tracks PayLater debts only.
export default function CommitmentsRedirect() {
  redirect("/payments");
}
