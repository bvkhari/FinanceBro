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
  FinancialCommitment,
  FinancialProfile,
  NewDebtInput,
  Transaction,
} from "./types";
import type { ScheduledInstalment } from "./debt/schedule";
import { todayISO } from "./utils";

type DbMode = "student" | "business";
type CommitmentKind = "bill" | "bnpl" | "loan" | "credit_card" | "supplier" | "rent" | "other";

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
  created_at: string;
}

interface CommitmentRow {
  id: string;
  name: string;
  kind: CommitmentKind;
  amount: string;
  due_date: string;
  recurrence: "none" | "monthly";
  instalments_left: number | null;
  outstanding_balance: string | null;
  status: "upcoming" | "paid" | "overdue";
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
}

export interface ProfileData {
  profile: FinancialProfile;
  transactions: Transaction[];
  commitments: FinancialCommitment[];
  debts: Debt[];
}

const toAppMode = (m: DbMode): AppMode => (m === "student" ? "individual" : "business");
const toDbMode = (m: AppMode): DbMode => (m === "individual" ? "student" : "business");

function kindToCategory(kind: CommitmentKind, mode: AppMode): string {
  if (mode === "business") {
    return {
      supplier: "Supplier Payments",
      rent: "Business Rent",
      loan: "Instalments",
      bnpl: "Instalments",
      credit_card: "Other Business Bills",
      bill: "Other Business Bills",
      other: "Other",
    }[kind];
  }
  return {
    rent: "Rent",
    bnpl: "Instalments",
    loan: "Instalments",
    bill: "Utilities",
    credit_card: "Other",
    supplier: "Other",
    other: "Other",
  }[kind];
}

function categoryToKind(category: string, mode: AppMode): CommitmentKind {
  switch (category) {
    case "Supplier Payments":
      return "supplier";
    case "Rent":
    case "Business Rent":
      return "rent";
    case "Instalments":
      return mode === "individual" ? "bnpl" : "loan";
    case "Internet":
    case "Utilities":
    case "Other Business Bills":
      return "bill";
    default:
      return "other";
  }
}

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
    createdAt: r.created_at,
  };
}

function mapCommitment(r: CommitmentRow, mode: AppMode): FinancialCommitment {
  return {
    id: r.id,
    mode,
    name: r.name,
    amount: Number(r.amount),
    dueDate: r.due_date,
    category: kindToCategory(r.kind, mode),
    status: r.status,
    recurring: r.recurrence === "monthly",
    instalmentsLeft: r.instalments_left ?? undefined,
    outstandingBalance: r.outstanding_balance === null ? undefined : Number(r.outstanding_balance),
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

/** Loads the profile for a mode with its transactions (newest first) and commitments. */
export async function fetchProfileData(mode: AppMode): Promise<ProfileData> {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  const p = check(
    await supabase.from("profiles").select("*").eq("mode", toDbMode(mode)).order("created_at").limit(1).single()
  ) as ProfileRow;

  const [txRows, cRows, budgetRows, debtRows] = await Promise.all([
    supabase.from("transactions").select("*").eq("profile_id", p.id)
      .order("txn_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("commitments").select("*").eq("profile_id", p.id).order("due_date"),
    supabase.from("budgets").select("month, limit_amount").eq("profile_id", p.id).order("month", { ascending: false }),
    supabase.from("debts").select("*, debt_instalments(*)").eq("profile_id", p.id).order("created_at"),
  ]).then((rs) => rs.map(check));

  const transactions = (txRows as TransactionRow[]).map((r) => mapTransaction(r, mode));
  const net = transactions.reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0);

  // Monthly budget = total of the latest budgeted month.
  const budgets = budgetRows as { month: string; limit_amount: string }[];
  const latestMonth = budgets[0]?.month;
  const monthlyBudget = budgets
    .filter((b) => b.month === latestMonth)
    .reduce((sum, b) => sum + Number(b.limit_amount), 0);

  return {
    profile: {
      id: p.id,
      mode,
      displayName: p.name,
      accountType: mode === "individual" ? "Student Account" : "Business Account",
      currency: p.currency === "MYR" ? "RM" : p.currency,
      // The DB holds today's balance; the UI adds the ledger on top of an opening balance.
      startingBalance: Math.round((Number(p.current_balance) - net) * 100) / 100,
      monthlyBudget,
      createdAt: p.created_at,
    },
    transactions,
    commitments: (cRows as CommitmentRow[]).map((r) => mapCommitment(r, mode)),
    debts: (debtRows as DebtRow[]).map((r) => mapDebt(r, mode, todayISO())),
  };
}

function transactionFields(t: Partial<Transaction>) {
  const row: Record<string, unknown> = {};
  if (t.name !== undefined) row.merchant = t.name;
  if (t.amount !== undefined) row.amount = t.amount;
  if (t.type !== undefined) row.direction = t.type;
  if (t.category !== undefined) row.category = t.category;
  if (t.date !== undefined) row.txn_date = t.date;
  if (t.description !== undefined) row.note = t.description || null;
  return row;
}

export async function insertTransaction(profileId: string, mode: AppMode, t: Omit<Transaction, "id" | "createdAt" | "mode">) {
  const row = check(
    await supabase.from("transactions")
      .insert({ ...transactionFields(t), profile_id: profileId, source: "manual", created_by: "user" })
      .select().single()
  ) as TransactionRow;
  return mapTransaction(row, mode);
}

export async function updateTransactionRow(profileId: string, id: string, updates: Partial<Transaction>) {
  check(await supabase.from("transactions").update(transactionFields(updates)).eq("profile_id", profileId).eq("id", id));
}

export async function deleteTransactionRow(profileId: string, id: string) {
  check(await supabase.from("transactions").delete().eq("profile_id", profileId).eq("id", id));
}

function commitmentFields(c: Partial<FinancialCommitment>, mode: AppMode) {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.amount !== undefined) row.amount = c.amount;
  if (c.dueDate !== undefined) row.due_date = c.dueDate;
  if (c.category !== undefined) row.kind = categoryToKind(c.category, mode);
  if (c.status !== undefined) row.status = c.status;
  if (c.recurring !== undefined) row.recurrence = c.recurring ? "monthly" : "none";
  return row;
}

export async function insertCommitment(profileId: string, mode: AppMode, c: Omit<FinancialCommitment, "id" | "createdAt" | "mode">) {
  const row = check(
    await supabase.from("commitments").insert({ ...commitmentFields(c, mode), profile_id: profileId }).select().single()
  ) as CommitmentRow;
  return mapCommitment(row, mode);
}

export async function updateCommitmentRow(profileId: string, mode: AppMode, id: string, updates: Partial<FinancialCommitment>) {
  check(await supabase.from("commitments").update(commitmentFields(updates, mode)).eq("profile_id", profileId).eq("id", id));
}

/**
 * Marks a bill paid and records the payment as one expense transaction.
 * The status update only succeeds once, so a double click can't record the
 * payment twice. Returns false when the bill was already paid.
 */
export async function markCommitmentPaidOnce(profileId: string, mode: AppMode, c: FinancialCommitment, paidDate: string) {
  const updated = check(
    await supabase.from("commitments").update({ status: "paid" })
      .eq("profile_id", profileId).eq("id", c.id).neq("status", "paid").select("id")
  ) as { id: string }[];
  if (updated.length === 0) return false;
  try {
    await insertTransaction(profileId, mode, {
      name: c.name,
      amount: c.amount,
      type: "expense",
      category: c.category,
      date: paidDate,
      description: `Payment for ${c.name}`,
    });
  } catch (e) {
    // Put the status back so the bill doesn't look paid without a payment record.
    await supabase.from("commitments").update({ status: c.status }).eq("profile_id", profileId).eq("id", c.id);
    throw e;
  }
  return true;
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

/** Calls `onChange` whenever any row for this profile changes (agent writes, other tabs). */
export function subscribeToProfile(profileId: string, onChange: () => void) {
  const filter = `profile_id=eq.${profileId}`;
  const channel = supabase
    .channel(`profile-${profileId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "commitments", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "budgets", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "debts", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "debt_instalments", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${profileId}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
