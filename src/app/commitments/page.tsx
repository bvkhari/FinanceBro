import { redirect } from "next/navigation";

// Bills are a report on /payments now.
export default function CommitmentsRedirect() {
  redirect("/payments?section=bills");
}
