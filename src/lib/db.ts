// ============================================================
// Supabase data layer — maps DB rows (Doc 4 schema) to the
// frontend types. Every query filters on profile_id.
// ============================================================

import { supabase, supabaseConfigError } from "./supabase";
import {
  AppMode,
  Debt,
  DebtDetailsUpdate,
  DebtFrequency,
  DebtInstalment,
  DebtStatus,
  DebtType,
  FinancialProfile,
  IncomeScheduleItem,
  NewDebtInput,
  Transaction,
} from "./types";
import type { ScheduledInstalment } from "./debt/schedule";
import { todayISO } from "./utils";
import { netCash } from "./cashflow";

type DbMode = "student" | "business";

interface ProfileRow {
  id: string;
  name: string;
  mode: DbMode;
  currency: string;
  current_balance: string;
  created_at: string;
}

interface TransactionRow {
  id: string;
  txn_date: string;
  amount: string;
  direction: "income" | "expense";
  category: string;
  merchant: string;
  note: string | null;
  flag: "duplicate" | "unusual" | null;
  cash_effect: boolean;
  created_at: string;
}

interface InstalmentRow {
  id: string;
  debt_id: string;
  due_date: string;
  amount: string;
  amount_paid: string;
  paid_date: string | null;
  status: "scheduled" | "partial" | "paid" | "cancelled";
}

interface DebtRow {
  id: string;
  profile_id: string;
  name: string;
  debt_type: DebtType;
  original_amount: string;
  outstanding_balance: string;
  repayment_amount: string | null;
  frequency: DebtFrequency;
  interest_rate: string | null;
  start_date: string | null;
  end_date: string | null;
  status: DebtStatus;
  reference_no: string | null;
  notes: string | null;
  is_sample: boolean;
  created_at: string;
  debt_instalments: InstalmentRow[];
  debt_payments: { paid_date: string; principal_amount: string }[];
}

export interface ProfileData {
  profile: FinancialProfile;
  transactions: Transaction[];
  debts: Debt[];
  incomeSchedule: IncomeScheduleItem[];
}

const toAppMode = (m: DbMode): AppMode => (m === "student" ? "individual" : "business");
const toDbMode = (m: AppMode): DbMode => (m === "individual" ? "student" : "business");

function mapTransaction(r: TransactionRow, mode: AppMode): Transaction {
  return {
    id: r.id,
    mode,
    name: r.merchant,
    amount: Number(r.amount),
    type: r.direction,
    category: r.category,
    date: r.txn_date,
    description: r.note ?? undefined,
    flag: r.flag ?? undefined,
    cashEffect: r.cash_effect,
    createdAt: r.created_at,
  };
}

const num = (v: string | null) => (v === null ? undefined : Number(v));
const cents = (n: number) => Math.round(n * 100);

function mapInstalment(r: InstalmentRow, today: string): DebtInstalment {
  const amount = Number(r.amount);
  const amountPaid = Number(r.amount_paid);
  const unpaid = r.status === "scheduled" || r.status === "partial";
  return {
    id: r.id,
    debtId: r.debt_id,
    dueDate: r.due_date,
    amount,
    amountPaid,
    remaining: r.status === "cancelled" ? 0 : (cents(amount) - cents(amountPaid)) / 100,
    paidDate: r.paid_date ?? undefined,
    // Overdue is derived from today's date so it is never stale.
    status: unpaid && r.due_date < today ? "overdue" : r.status === "scheduled" ? "upcoming" : r.status,
  };
}

function mapDebt(r: DebtRow, mode: AppMode, today: string): Debt {
  const instalments = r.debt_instalments
    .map((i) => mapInstalment(i, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    id: r.id,
    profileId: r.profile_id,
    mode,
    name: r.name,
    debtType: r.debt_type,
    originalAmount: Number(r.original_amount),
    outstandingBalance: Number(r.outstanding_balance),
    repaymentAmount: num(r.repayment_amount),
    frequency: r.frequency,
    interestRate: num(r.interest_rate),
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    status: r.status,
    referenceNo: r.reference_no ?? undefined,
    notes: r.notes ?? undefined,
    isSample: r.is_sample,
    createdAt: r.created_at,
    instalments,
    nextInstalment: instalments.find((i) => i.remaining > 0),
    payments: r.debt_payments
      .map((p) => ({ date: p.paid_date, principal: Number(p.principal_amount) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    unscheduledBalance:
      r.status === "active"
        ? Math.max(0, cents(Number(r.outstanding_balance)) - instalments.reduce((s, i) => s + cents(i.remaining), 0)) / 100
        : 0,
  };
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/**
 * Loads the personal profile with its BNPL debts and the transactions behind its cash balance (newest first).
 * The app is BNPL-only: other debt types, bills and the business profile stay in the database but aren't loaded.
 */
export async function fetchProfileData(): Promise<ProfileData> {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  const mode: AppMode = "individual";
  const p = check(
    await supabase.from("profiles").select("*").eq("mode", toDbMode(mode)).order("created_at").limit(1).single()
  ) as ProfileRow;

  const [txRows, debtRows, incomeRows] = await Promise.all([
    supabase.from("transactions").select("*").eq("profile_id", p.id)
      .order("txn_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("debts").select("*, debt_instalments(*), debt_payments(paid_date, principal_amount)")
      .eq("profile_id", p.id).eq("debt_type", "bnpl").order("created_at"),
    supabase.from("income_schedule").select("id, source, expected_amount, expected_date, confirmed").eq("profile_id", p.id).order("expected_date"),
  ]).then((rs) => rs.map(check));

  const transactions = (txRows as TransactionRow[]).map((r) => mapTransaction(r, mode));
  // Purchases on credit don't move cash, so they are left out of the balance.
  const net = netCash(transactions);

  return {
    profile: {
      id: p.id,
      mode,
      displayName: p.name,
      accountType: "PayLater tracker",
      currency: p.currency === "MYR" ? "RM" : p.currency,
      // The DB holds today's balance; the UI adds the ledger on top of an opening balance.
      startingBalance: Math.round((Number(p.current_balance) - net) * 100) / 100,
      createdAt: p.created_at,
    },
    transactions,
    debts: (debtRows as DebtRow[]).map((r) => mapDebt(r, mode, todayISO())),
    incomeSchedule: (incomeRows as { id: string; source: string; expected_amount: string; expected_date: string; confirmed: boolean }[]).map((r) => ({
      id: r.id,
      source: r.source,
      expectedAmount: Number(r.expected_amount),
      expectedDate: r.expected_date,
      confirmed: r.confirmed,
    })),
  };
}

// ---------- debts ----------

/** Creates a debt and its schedule in one database transaction. */
export async function createDebt(profileId: string, input: NewDebtInput, schedule: ScheduledInstalment[]) {
  check(
    await supabase.rpc("create_debt", {
      p_debt: {
        profile_id: profileId,
        name: input.name,
        debt_type: input.debtType,
        original_amount: input.originalAmount,
        outstanding_balance: input.outstandingBalance,
        repayment_amount: input.repaymentAmount ?? null,
        frequency: input.frequency,
        interest_rate: input.interestRate ?? null,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
        reference_no: input.referenceNo || null,
        notes: input.notes || null,
        purchase: input.purchase
          ? { txn_date: input.purchase.date, category: input.purchase.category, note: input.purchase.note ?? "" }
          : null,
      },
      p_instalments: schedule,
    })
  );
}

/** Edits descriptive details only. Amounts and the schedule are never changed here. */
export async function updateDebtDetails(profileId: string, id: string, u: DebtDetailsUpdate) {
  const row: Record<string, unknown> = {};
  if (u.name !== undefined) row.name = u.name;
  if (u.debtType !== undefined) row.debt_type = u.debtType;
  if (u.interestRate !== undefined) row.interest_rate = u.interestRate ?? null;
  if (u.startDate !== undefined) row.start_date = u.startDate || null;
  if (u.endDate !== undefined) row.end_date = u.endDate || null;
  if (u.referenceNo !== undefined) row.reference_no = u.referenceNo || null;
  if (u.notes !== undefined) row.notes = u.notes || null;
  check(await supabase.from("debts").update(row).eq("profile_id", profileId).eq("id", id));
}

export interface PaymentResult {
  duplicate: boolean;
  principal?: number;
  interest?: number;
  instalment_remaining?: number;
  outstanding_balance?: number;
}

/**
 * Records a confirmed payment. `idempotencyKey` must stay the same for one
 * payment attempt (create it when the payment form opens), so a double
 * submit can never record the payment twice.
 */
export async function recordDebtPayment(p: {
  instalmentId: string;
  amount: number;
  paidDate: string;
  interest: number;
  idempotencyKey: string;
}): Promise<PaymentResult> {
  return check(
    await supabase.rpc("record_debt_payment", {
      p_instalment_id: p.instalmentId,
      p_amount: p.amount,
      p_paid_date: p.paidDate,
      p_idempotency_key: p.idempotencyKey,
      p_interest: p.interest,
    })
  ) as PaymentResult;
}

// ---------- schedule edits (paid history is never touched; the SQL functions enforce it) ----------

export async function updateInstalment(instalmentId: string, dueDate: string, amount: number) {
  check(await supabase.rpc("update_debt_instalment", { p_instalment_id: instalmentId, p_due_date: dueDate, p_amount: amount }));
}

export async function cancelInstalment(instalmentId: string) {
  check(await supabase.rpc("cancel_debt_instalment", { p_instalment_id: instalmentId }));
}

/** Adds instalments; due dates that already exist are skipped. Returns how many were added. */
export async function addInstalments(debtId: string, schedule: ScheduledInstalment[]) {
  return check(await supabase.rpc("add_debt_instalments", { p_debt_id: debtId, p_instalments: schedule })) as number;
}

/** Replaces every instalment with no payments by a new schedule. Returns how many were created. */
export async function rescheduleDebt(debtId: string, frequency: DebtFrequency, repaymentAmount: number | undefined, schedule: ScheduledInstalment[]) {
  return check(
    await supabase.rpc("reschedule_debt", {
      p_debt_id: debtId,
      p_frequency: frequency,
      p_repayment_amount: repaymentAmount ?? null,
      p_instalments: schedule,
    })
  ) as number;
}

// ---------- budgets, expected income and agent runs (used by the AI agent) ----------

export interface BudgetLine {
  category: string;
  limit: number;
  essential: boolean;
  createdBy: "user" | "agent";
}

/** Budget lines for one month (`month` = first day) and the profile's safety buffer %. */
export async function fetchBudgetLines(profileId: string, month: string) {
  const [rowsRes, pRes] = await Promise.all([
    supabase.from("budgets").select("category, limit_amount, essential, created_by").eq("profile_id", profileId).eq("month", month).order("category"),
    supabase.from("profiles").select("safety_buffer_pct").eq("id", profileId).single(),
  ]);
  const rows = check(rowsRes);
  const p = check(pRes);
  return {
    budgets: (rows as { category: string; limit_amount: string; essential: boolean; created_by: "user" | "agent" }[]).map((r) => ({
      category: r.category,
      limit: Number(r.limit_amount),
      essential: r.essential,
      createdBy: r.created_by,
    })) as BudgetLine[],
    safetyBufferPct: Number((p as { safety_buffer_pct: string }).safety_buffer_pct),
  };
}

export type IncomeSource = "allowance" | "salary" | "PTPTN" | "sales" | "other";

export async function insertExpectedIncome(profileId: string, i: { source: IncomeSource; expectedAmount: number; expectedDate: string; confirmed: boolean }) {
  const row = check(
    await supabase.from("income_schedule")
      .insert({ profile_id: profileId, source: i.source, expected_amount: i.expectedAmount, expected_date: i.expectedDate, confirmed: i.confirmed })
      .select("id").single()
  ) as { id: string };
  return row.id;
}

export interface AgentActivity {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
  isWrite: boolean;
  createdAt: string;
}

export async function profileIdFor(mode: AppMode): Promise<string> {
  const p = check(
    await supabase.from("profiles").select("id").eq("mode", toDbMode(mode)).order("created_at").limit(1).single()
  ) as { id: string };
  return p.id;
}

/** Records one tool call made by an outside agent (WorkBuddy over MCP). */
export async function logAgentActivity(profileId: string, a: Omit<AgentActivity, "id" | "createdAt">) {
  check(
    await supabase.from("agent_activity").insert({
      profile_id: profileId, tool: a.tool, input: a.input, ok: a.ok, summary: a.summary, is_write: a.isWrite,
    })
  );
}

export async function fetchAgentActivity(profileId: string, limit = 50): Promise<AgentActivity[]> {
  const rows = check(
    await supabase.from("agent_activity").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(limit)
  ) as { id: string; tool: string; input: Record<string, unknown>; ok: boolean; summary: string; is_write: boolean; created_at: string }[];
  return rows.map((r) => ({ id: r.id, tool: r.tool, input: r.input, ok: r.ok, summary: r.summary, isWrite: r.is_write, createdAt: r.created_at }));
}

export function subscribeToAgentActivity(profileId: string, onChange: () => void) {
  const channel = supabase
    .channel(`agent-activity-${profileId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_activity", filter: `profile_id=eq.${profileId}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Calls `onChange` whenever any row for this profile changes (agent writes, other tabs). */
export function subscribeToProfile(profileId: string, onChange: () => void) {
  const filter = `profile_id=eq.${profileId}`;
  const channel = supabase
    .channel(`profile-${profileId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "debts", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "debt_instalments", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "income_schedule", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${profileId}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
