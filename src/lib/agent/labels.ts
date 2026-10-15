/**
 * Plain-English names for the agent tools, shown in the chat steps and the activity feed.
 * Retired tools (transactions, budgets, bills) stay listed so old activity still reads well.
 */
export const TOOL_LABELS: Record<string, string> = {
  get_snapshot: "Read PayLater snapshot",
  list_transactions: "Looked up transactions",
  list_debts: "Looked up PayLater plans",
  list_payments_due: "Checked instalments due",
  monthly_report: "Built monthly report",
  generate_report: "Generated report",
  check_affordability: "Checked affordability",
  debt_payoff_scenario: "Ran payoff scenario",
  add_transactions: "Added transactions",
  update_transaction: "Fixed a transaction",
  set_budgets: "Set budgets",
  add_bill: "Added a bill",
  mark_bill_paid: "Recorded bill payment",
  add_debt: "Added a PayLater plan",
  record_debt_payment: "Recorded PayLater payment",
  add_expected_income: "Added expected income",
};
