// ============================================================
// Supabase data layer — maps DB rows (Doc 4 schema) to the
// frontend types. Every query filters on profile_id.
// ============================================================

import { supabase, supabaseConfigError } from "./supabase";
import { AppMode, FinancialCommitment, FinancialProfile, Transaction } from "./types";

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

export interface ProfileData {
  profile: FinancialProfile;
  transactions: Transaction[];
  commitments: FinancialCommitment[];
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

  const [txRows, cRows, budgetRows] = await Promise.all([
    supabase.from("transactions").select("*").eq("profile_id", p.id)
      .order("txn_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("commitments").select("*").eq("profile_id", p.id).order("due_date"),
    supabase.from("budgets").select("month, limit_amount").eq("profile_id", p.id).order("month", { ascending: false }),
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

/** Calls `onChange` whenever any row for this profile changes (agent writes, other tabs). */
export function subscribeToProfile(profileId: string, onChange: () => void) {
  const filter = `profile_id=eq.${profileId}`;
  const channel = supabase
    .channel(`profile-${profileId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "commitments", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "budgets", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${profileId}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
