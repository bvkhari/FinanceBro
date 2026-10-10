// ============================================================
// FinanceBro AI — Core TypeScript Interfaces
// These interfaces define the data contracts for the entire app.
// Backend teammates can replace mock implementations with real
// API calls by conforming to these same interfaces.
// ============================================================

/** Application mode — Individual or Business */
export type AppMode = "individual" | "business";

/** Income/Expense type for transactions */
export type TransactionType = "income" | "expense";

/** Commitment payment status */
export type PaymentStatus = "upcoming" | "paid" | "overdue";

/** Financial profile for a user in a given mode */
export interface FinancialProfile {
  id: string;
  mode: AppMode;
  displayName: string;
  accountType: string;
  currency: string;
  startingBalance: number;
  monthlyBudget: number;
  createdAt: string;
}

/** A single financial transaction */
export interface Transaction {
  id: string;
  mode: AppMode;
  name: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string; // ISO date string
  description?: string;
  createdAt: string;
}

/** A financial commitment / upcoming bill */
export interface FinancialCommitment {
  id: string;
  mode: AppMode;
  name: string;
  amount: number;
  dueDate: string; // ISO date string
  category: string;
  status: PaymentStatus;
  recurring: boolean;
  createdAt: string;
  paidTransactionId?: string; // Links to a Transaction if paid
}

/** Budget summary for weekly/monthly views */
export interface Budget {
  mode: AppMode;
  period: "weekly" | "monthly";
  totalBudget: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
}

/** Aggregated financial summary */
export interface FinancialSummary {
  mode: AppMode;
  currentBalance: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  upcomingCommitments: number;
  budgetRemaining: number;
  projectedRemainingBalance: number;
}

/** Chat message in the FinanceBro AI conversation */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isDemoPreview?: boolean;
  agentSteps?: AgentExecutionStep[];
  agentActions?: AgentAction[];
  transactionPreview?: TransactionPreviewData;
  budgetProposal?: BudgetProposalData;
}

/** Agent execution step in the AI workflow */
export interface AgentExecutionStep {
  id: string;
  step: number;
  label: string;
  status: "pending" | "active" | "completed" | "error";
  description?: string;
}

/** Agent action that can be confirmed or cancelled */
export interface AgentAction {
  id: string;
  type: "add_transaction" | "update_budget" | "pay_commitment" | "create_commitment" | "show_summary";
  label: string;
  status: "awaiting_approval" | "approved" | "cancelled" | "executing" | "completed" | "error";
  data?: Record<string, unknown>;
}

/** Transaction preview data shown in chat for confirmation */
export interface TransactionPreviewData {
  amount: number;
  type: TransactionType;
  category: string;
  account: string;
  description?: string;
}

/** Budget proposal data shown in chat */
export interface BudgetProposalData {
  category: string;
  currentBudget: number;
  proposedBudget: number;
  reason: string;
}

/** Spending category breakdown for charts */
export interface CategoryBreakdown {
  category: string;
  amount: number;
  color: string;
  percentage: number;
}

/** Income vs Expense data for charts */
export interface IncomeExpenseData {
  label: string;
  income: number;
  expenses: number;
}

/** Suggested prompt for the AI chat */
export interface SuggestedPrompt {
  id: string;
  text: string;
  icon?: string;
}

/** Notification item */
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success";
  read: boolean;
  timestamp: string;
}

/** Modal component props */
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}
