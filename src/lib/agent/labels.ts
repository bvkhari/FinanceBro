/** Plain-English names for the agent tools, shown in the chat steps and the activity feed. */
export const TOOL_LABELS: Record<string, string> = {
  get_snapshot: "Read financial snapshot",
  list_transactions: "Looked up transactions",
  list_debts: "Looked up debts",
  list_payments_due: "Checked payments due",
  monthly_report: "Built monthly report",
  generate_report: "Generated report",
  check_affordability: "Checked affordability",
  debt_payoff_scenario: "Ran payoff scenario",
  add_transactions: "Added transactions",
  update_transaction: "Fixed a transaction",
  set_budgets: "Set budgets",
  add_bill: "Added a bill",
  mark_bill_paid: "Recorded bill payment",
  add_debt: "Added a debt",
  record_debt_payment: "Recorded debt payment",
  add_expected_income: "Added expected income",
};
