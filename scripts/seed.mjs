#!/usr/bin/env node
// FinanceBro AI — seed data for the two demo personas (Doc 4 "Seed data").
//
//   npm run seed          regenerate supabase/seed.sql and apply it to the linked project
//   npm run seed -- --dry regenerate supabase/seed.sql only
//
// The data is deterministic (fixed PRNG seed), so every reset gives the same numbers.
// Applying goes through `supabase db query --linked` (Management API over HTTPS), so it
// works even where direct Postgres ports are blocked. Requires a logged-in Supabase CLI.
//
// Tuning (see CLAUDE.md): before the agent run, safe-to-spend is negative/tight for both
// profiles. The script prints the inputs so you can check them by hand.

import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateSchedule, normaliseIrregularSchedule } from "../src/lib/debt/schedule.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");

export const KOPI_SENJA_ID = "00000000-0000-4000-8000-000000000001";
export const STUDENT_ID = "00000000-0000-4000-8000-000000000002";

// ---------- deterministic randomness ----------
let s = 20261010;
function rand() {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const d = (m, day) => `2026-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const dow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday

// ---------- builders ----------
const txns = [];
function tx(profile_id, txn_date, direction, amount, category, merchant, source, extra = {}) {
  txns.push({ profile_id, txn_date, direction, amount, category, merchant, source, ...extra });
}
// Every amount is whole ringgit and the monthly totals are round, so the pitch numbers are easy to follow.
const wholeRM = (lo, hi) => Math.round(between(lo, hi));
// Nudges the amounts by RM1 at a time until they add up to `total`.
function topUpTo(rows, total) {
  let diff = total - rows.reduce((a, t) => a + t.amount, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % rows.length) {
    const step = Math.sign(diff);
    if (rows[i].amount + step < 4) continue;
    rows[i].amount += step;
    diff -= step;
  }
}

// ======================================================================
// Kopi Senja — café, ~RM 28k/month revenue
// ======================================================================
const K = KOPI_SENJA_ID;

const groceries = ["Lotus's", "NSK Trade City", "Mydin"];
// `totals` maps a merchant (or "Groceries") to what it adds up to for the month.
function kopiMonth(m, lastDay, totals) {
  const start = txns.length;
  for (let day = 1; day <= lastDay; day++) {
    const date = d(m, day);
    const w = dow(date);
    if (w === 1) {
      // Closed on Mondays; the weekly QR/card processing fee still posts
      tx(K, date, "expense", wholeRM(38, 52), "Operating Expenses", "Maybank QR MDR fee", "bank");
      continue;
    }
    const weekend = w === 0 || w === 6;
    tx(K, date, "income", weekend ? wholeRM(950, 1200) : wholeRM(620, 800),
      "Sales Revenue", "Daily sales (cash + DuitNow QR)", "bank");
    tx(K, date, "expense", wholeRM(25, 40), "Ingredients", "Ice supply", "cash");
    if (w === 3) tx(K, date, "income", wholeRM(1200, 1450), "Delivery Sales", "GrabFood payout", "bank");
    if (w === 2 || w === 5) tx(K, date, "expense", wholeRM(240, 300), "Ingredients", "Farm Fresh (milk)", "bank");
    if (w === 0 || w === 3) tx(K, date, "expense", wholeRM(240, 290), "Ingredients", "Roti Mak Teh (pastries)", "bank");
    if (w === 5) tx(K, date, "expense", wholeRM(60, 110), "Ingredients", "Pasar borong (fruit, pandan)", "cash");
    if (w === 6) tx(K, date, "expense", wholeRM(90, 160), "Ingredients", pick(groceries), "cash");
    if (w === 0) tx(K, date, "expense", wholeRM(35, 70), "Operating Expenses", "Cleaning supplies", "cash");
  }
  const rows = txns.slice(start);
  for (const [key, total] of Object.entries(totals))
    topUpTo(rows.filter((t) => (groceries.includes(t.merchant) ? "Groceries" : t.merchant) === key), total);
}

// September: income RM28,000, spending RM27,000 (RM21,250 cash + RM5,750 on credit), plus
// RM6,750 of debt repayments, so cash ends the month where it started (RM3,000).
kopiMonth(9, 30, {
  "Daily sales (cash + DuitNow QR)": 21500, "GrabFood payout": 6500,
  "Ice supply": 800, "Farm Fresh (milk)": 2250, "Roti Mak Teh (pastries)": 2250,
  "Pasar borong (fruit, pandan)": 300, Groceries: 400, "Cleaning supplies": 200, "Maybank QR MDR fee": 200,
});
// Monthly September costs
tx(K, d(9, 15), "expense", 3200, "Rent", "Shoplot rent – Tmn Tun Dr Ismail", "bank");
tx(K, d(9, 3), "expense", 400, "Packaging", "EcoPack Supplies", "bank");
tx(K, d(9, 17), "expense", 400, "Packaging", "EcoPack Supplies", "bank");
tx(K, d(9, 15), "expense", 3750, "Wages", "Staff wages (1–15 Sep)", "bank");
tx(K, d(9, 30), "expense", 3750, "Wages", "Staff wages (16–30 Sep)", "bank");
tx(K, d(9, 22), "expense", 600, "Utilities", "TNB electricity", "bank");
tx(K, d(9, 24), "expense", 100, "Utilities", "Air Selangor", "bank");
tx(K, d(9, 7), "expense", 200, "Utilities", "Unifi Business", "bank");
tx(K, d(9, 5), "expense", 200, "Marketing", "Meta ads", "bank");
tx(K, d(9, 19), "expense", 200, "Marketing", "Meta ads", "bank");
tx(K, d(9, 11), "expense", 125, "Operating Expenses", "LPG gas cylinder", "cash");
tx(K, d(9, 25), "expense", 125, "Operating Expenses", "LPG gas cylinder", "cash");
tx(K, d(9, 9), "expense", 300, "Operating Expenses", "Espresso machine service", "bank");
// Planted duplicate supplier charge (same merchant, date and amount; flag left empty for the agent).
// Beans normally go on the monthly 30-day invoice (see debts); this was a paid-on-the-spot top-up order.
tx(K, d(9, 24), "expense", 600, "Ingredients", "Kopi Bumi Roasters", "bank", { note: "Top-up order KBR-T0924" });
tx(K, d(9, 24), "expense", 600, "Ingredients", "Kopi Bumi Roasters", "bank", { note: "Top-up order KBR-T0924" });
// Uncategorised rows for the agent to fix
tx(K, d(9, 8), "expense", 250, "Uncategorised", "DuitNow transfer – AHMAD BIN K", "bank");
tx(K, d(9, 27), "expense", 50, "Uncategorised", "QR payment SERI MURNI", "ewallet");

// 1–10 October: income RM8,600, spending RM2,200 → RM9,400 in the bank today.
kopiMonth(10, 10, {
  "Daily sales (cash + DuitNow QR)": 7300, "GrabFood payout": 1300,
  "Ice supply": 300, "Farm Fresh (milk)": 750, "Roti Mak Teh (pastries)": 500,
  "Pasar borong (fruit, pandan)": 150, Groceries: 200, "Cleaning supplies": 50, "Maybank QR MDR fee": 50,
});
tx(K, d(10, 6), "expense", 200, "Marketing", "Meta ads", "bank");

// ======================================================================
// Student — Aina, uni student on allowance + part-time tutoring
// ======================================================================
const S = STUDENT_ID;

// Aina's amounts are whole ringgit and her monthly totals are round, so the pitch numbers are easy
// to follow: September spending RM1,300 (RM1,000 cash + RM300 Shopee PayLater), income RM1,000.
const foodSpots = ["Mamak Bistro", "Kafe Fakulti", "GrabFood", "Tealive", "Nasi Kandar Pelita", "7-Eleven", "FamilyMart"];
function studentMonth(m, lastDay, foodTotal, transportTotal) {
  const start = txns.length;
  for (let day = 1; day <= lastDay; day++) {
    const date = d(m, day);
    if (rand() < 0.9) {
      const spot = pick(foodSpots);
      tx(S, date, "expense", spot === "GrabFood" ? wholeRM(14, 26) : wholeRM(6, 16), "Food", spot, spot === "GrabFood" ? "ewallet" : pick(["cash", "ewallet"]));
    }
    if (day % 4 === 2) tx(S, date, "expense", wholeRM(4, 15), "Transportation", pick(["Grab ride", "Rapid KL (LRT)"]), "ewallet");
  }
  const rows = txns.slice(start);
  topUpTo(rows.filter((t) => t.category === "Food"), foodTotal);
  topUpTo(rows.filter((t) => t.category === "Transportation"), transportTotal);
}

studentMonth(9, 30, 330, 80);
tx(S, d(9, 15), "income", 600, "Allowance", "Transfer from Mak", "bank");
tx(S, d(9, 14), "income", 200, "Part-time income", "Tutoring – Cikgu Online", "bank");
tx(S, d(9, 28), "income", 200, "Part-time income", "Tutoring – Cikgu Online", "bank");
tx(S, d(9, 11), "expense", 450, "Rent", "Room rent share", "bank");
tx(S, d(9, 13), "expense", 50, "Utilities", "CelcomDigi postpaid", "bank");
tx(S, d(9, 3), "expense", 10, "Subscriptions", "Spotify Student", "bank");
tx(S, d(9, 13), "expense", 30, "Entertainment", "GSC cinema", "ewallet");
tx(S, d(9, 24), "expense", 30, "Education", "Lab manual", "cash");
tx(S, d(9, 26), "expense", 20, "Uncategorised", "TNG eWallet reload", "ewallet");

studentMonth(10, 10, 120, 30);
tx(S, d(10, 3), "expense", 10, "Subscriptions", "Spotify Student", "bank");

// ---------- profiles, budgets, commitments, income ----------
const profiles = [
  { id: K, name: "Kopi Senja", mode: "business", current_balance: 9400, safety_buffer_pct: 10 },
  { id: S, name: "Aina Rahman", mode: "student", current_balance: 720, safety_buffer_pct: 10 },
];

// September budgets only — the agent creates October's.
const budgets = [
  [K, "Ingredients", 10000, true], [K, "Packaging", 800, true], [K, "Wages", 7500, true],
  [K, "Rent", 3200, true], [K, "Utilities", 900, true], [K, "Marketing", 400, false],
  [K, "Operating Expenses", 3600, false],
  [S, "Food", 350, true], [S, "Transportation", 100, true], [S, "Rent", 450, true],
  [S, "Utilities", 50, true], [S, "Shopping", 150, false], [S, "Subscriptions", 20, false],
  [S, "Entertainment", 40, false], [S, "Education", 40, true],
].map(([profile_id, category, limit_amount, essential]) => ({
  profile_id, month: "2026-09-01", category, limit_amount, essential,
}));

const commitments = [
  // Bills only. BNPL, loans, cards and supplier invoices live in `debts` below.
  { profile_id: K, name: "Shoplot rent", kind: "rent", amount: 3200, due_date: d(10, 15), recurrence: "monthly" },
  { profile_id: K, name: "TNB electricity", kind: "bill", amount: 600, due_date: d(10, 22), recurrence: "monthly" },
  { profile_id: K, name: "Unifi Business", kind: "bill", amount: 200, due_date: d(10, 7), recurrence: "monthly", status: "overdue" },
  // Student
  { profile_id: S, name: "Room rent share", kind: "rent", amount: 450, due_date: d(10, 11), recurrence: "monthly" },
  { profile_id: S, name: "CelcomDigi postpaid", kind: "bill", amount: 50, due_date: d(10, 13), recurrence: "monthly" },
];

const income = [
  { profile_id: K, source: "sales", expected_amount: 7800, expected_date: d(10, 16), confirmed: true },
  { profile_id: K, source: "sales", expected_amount: 8200, expected_date: d(10, 31), confirmed: false },
  { profile_id: S, source: "allowance", expected_amount: 600, expected_date: d(10, 15), confirmed: true },
  { profile_id: S, source: "other", expected_amount: 200, expected_date: d(10, 26), confirmed: false },
];

// ---------- debts (all fictional sample records) ----------
// `schedule` comes from the same generator the app uses. `paid` lists the
// instalments already paid; they go through record_debt_payment(), exactly
// like a payment made in the app, so the history is linked end to end.
const debtId = (n) => `00000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`;
const monthly = (amount, repayment, first) =>
  generateSchedule({ amount, instalmentAmount: repayment, frequency: "monthly", firstDueDate: first });
const once = (amount, due) => generateSchedule({ amount, frequency: "one_time", firstDueDate: due });

const debts = [
  // Aina — three BNPL apps, one plan each. The story: RM760 still owed, RM480 due
  // this month, and TikTok's 5 Oct instalment is already overdue.
  { id: debtId(1), profile_id: S, name: "Shopee PayLater", debt_type: "bnpl", original_amount: 300, repayment_amount: 100,
    frequency: "monthly", schedule: monthly(300, 100, d(10, 15)), notes: "Wireless earbuds, RM100 × 3 months",
    start_date: d(9, 15), end_date: d(12, 15),
    purchase: { txn_date: d(9, 15), category: "Shopping", note: "Wireless earbuds (Shopee PayLater)" } },
  { id: debtId(2), profile_id: S, name: "TikTok PayLater", debt_type: "bnpl", original_amount: 240, repayment_amount: 80,
    frequency: "monthly", schedule: monthly(240, 80, d(9, 5)), paid: [d(9, 5)], notes: "Sneakers from TikTok Shop, RM80 × 3 months",
    start_date: "2026-08-05", end_date: d(11, 5),
    purchase: { txn_date: "2026-08-05", category: "Shopping", note: "Sneakers (TikTok PayLater)" } },
  { id: debtId(3), profile_id: S, name: "Atome", debt_type: "bnpl", original_amount: 900, repayment_amount: 300,
    frequency: "monthly", schedule: monthly(900, 300, "2026-08-20"), paid: ["2026-08-20", d(9, 20)],
    notes: "Phone, 3 payments of RM300 (first paid at checkout)", start_date: "2026-08-20", end_date: d(10, 20),
    purchase: { txn_date: "2026-08-20", category: "Shopping", note: "Phone (Atome, 3 payments)" } },
  // Kopi Senja — one supplier invoice due before the next payout, a card statement, a bank loan.
  // August's invoice and statement were paid in September, so they show as paid off.
  { id: debtId(14), profile_id: K, name: "Kopi Bumi Roasters", debt_type: "supplier_invoice", original_amount: 3300,
    frequency: "one_time", schedule: once(3300, d(9, 14)), paid: [d(9, 14)], reference_no: "KBR-0901", notes: "August beans, 30-day terms",
    purchase: { txn_date: "2026-08-14", category: "Ingredients", note: "Beans on 30-day terms (invoice KBR-0901)" } },
  { id: debtId(15), profile_id: K, name: "Maybank Business card", debt_type: "business_credit_card", original_amount: 2450,
    frequency: "one_time", schedule: once(2450, d(9, 18)), paid: [d(9, 18)], reference_no: "Statement Aug 2026", interest_rate: 15,
    notes: "Paid in full, no interest",
    purchase: { txn_date: "2026-08-31", category: "Operating Expenses", note: "August card purchases (statement)" } },
  { id: debtId(11), profile_id: K, name: "Kopi Bumi Roasters", debt_type: "supplier_invoice", original_amount: 3400,
    frequency: "one_time", schedule: once(3400, d(10, 14)), reference_no: "KBR-1001", notes: "September beans, 30-day terms",
    purchase: { txn_date: d(9, 14), category: "Ingredients", note: "Beans on 30-day terms (invoice KBR-1001)" } },
  { id: debtId(12), profile_id: K, name: "Maybank Business card", debt_type: "business_credit_card", original_amount: 2350,
    frequency: "one_time", schedule: once(2350, d(10, 18)), reference_no: "Statement Sep 2026", interest_rate: 15,
    notes: "Full statement balance; interest applies only if not paid in full",
    purchase: { txn_date: d(9, 30), category: "Operating Expenses", note: "September card purchases (statement)" } },
  { id: debtId(13), profile_id: K, name: "SME Bank – working capital loan", debt_type: "business_loan", original_amount: 30000,
    // RM30,000 drawn 28 Sep 2025; 11 repayments of RM1,000 (Oct 2025 – Aug 2026) were made before the app →
    // RM19,000 left on 1 Sep; the 28 Sep repayment is in the app → RM18,000 owed now.
    outstanding_balance: 19000, repayment_amount: 1000, frequency: "monthly", schedule: monthly(19000, 1000, d(9, 28)), paid: [d(9, 28)],
    start_date: "2025-09-28", reference_no: "SMEB-WC-7781", notes: "Repayments before September 2026 were not tracked in the app" },
];

// ---------- SQL ----------
const lit = (v) =>
  v === undefined || v === null ? "null"
  : typeof v === "number" ? v.toFixed(2).replace(/\.00$/, "")
  : typeof v === "boolean" ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;

function insert(table, rows, cols) {
  const values = rows.map((r) => `  (${cols.map((c) => (c === "instalments_left" ? (r[c] ?? "null") : lit(r[c]))).join(", ")})`);
  return `insert into ${table} (${cols.join(", ")}) values\n${values.join(",\n")};\n`;
}

txns.sort((a, b) => a.profile_id.localeCompare(b.profile_id) || a.txn_date.localeCompare(b.txn_date));
txns.forEach((t, i) => (t.created_at = `${t.txn_date}T${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00+08`));
commitments.forEach((c) => (c.status ??= "upcoming"));

const sql = `-- Generated by scripts/seed.mjs — do not edit by hand. Run \`npm run seed\`.
begin;

delete from profiles where id in (${lit(K)}, ${lit(S)});

${insert("profiles", profiles, ["id", "name", "mode", "current_balance", "safety_buffer_pct"])}
${insert("transactions", txns, ["profile_id", "txn_date", "direction", "amount", "category", "merchant", "source", "note", "created_at"])}
${insert("budgets", budgets, ["profile_id", "month", "category", "limit_amount", "essential"])}
${insert("commitments", commitments, ["profile_id", "name", "kind", "amount", "due_date", "recurrence", "instalments_left", "outstanding_balance", "status"])}
${insert("income_schedule", income, ["profile_id", "source", "expected_amount", "expected_date", "confirmed"])}
${debts.map((dbt) => {
  const { schedule, paid = [], ...fields } = dbt;
  return `select create_debt(${lit(JSON.stringify({ ...fields, is_sample: true }))}::jsonb, ${lit(JSON.stringify(schedule))}::jsonb);`;
}).join("\n")}

-- Instalments already paid, recorded through the same function the app uses.
${debts.flatMap((dbt) => (dbt.paid ?? []).map((due) => {
  const inst = dbt.schedule.find((i) => i.due_date === due);
  if (!inst) throw new Error(`${dbt.name}: no instalment due ${due}`);
  return `select record_debt_payment((select id from debt_instalments where debt_id = ${lit(dbt.id)} and due_date = ${lit(due)}), ${lit(inst.amount)}, ${lit(due)}, ${lit(`seed-${dbt.id}-${due}`)});`;
})).join("\n")}

-- The balance trigger moved current_balance while the history was inserted; pin it to today's balance.
${profiles.map((p) => `update profiles set current_balance = ${lit(p.current_balance)} where id = ${lit(p.id)};`).join("\n")}

commit;
`;

const seedPath = path.join(root, "supabase", "seed.sql");
writeFileSync(seedPath, sql);

// ---------- summary for hand-checking ----------
const cents = (n) => Math.round(n * 100);
for (const p of profiles) {
  const mine = txns.filter((t) => t.profile_id === p.id);
  const sum = (f) => mine.filter(f).reduce((a, t) => a + cents(t.amount), 0) / 100;
  const sepIn = sum((t) => t.direction === "income" && t.txn_date.startsWith("2026-09"));
  // Expenses exclude repayments (not an expense) and include purchases made on credit.
  const sepCredit = debts
    .filter((dbt) => dbt.profile_id === p.id && dbt.purchase?.txn_date.startsWith("2026-09"))
    .reduce((a, dbt) => a + cents(dbt.original_amount), 0) / 100;
  const sepOut = sum((t) => t.direction === "expense" && t.category !== "Debt Repayment" && t.txn_date.startsWith("2026-09")) + sepCredit;
  const next = income.filter((i) => i.profile_id === p.id).sort((a, b) => a.expected_date.localeCompare(b.expected_date))[0];
  const billsDue = commitments
    .filter((c) => c.profile_id === p.id && c.status !== "paid" && c.due_date < next.expected_date)
    .reduce((a, c) => a + cents(c.amount), 0);
  const instalmentsDue = debts
    .filter((dbt) => dbt.profile_id === p.id)
    .flatMap((dbt) => dbt.schedule.filter((i) => !(dbt.paid ?? []).includes(i.due_date)))
    .filter((i) => i.due_date < next.expected_date)
    .reduce((a, i) => a + cents(i.amount), 0);
  const dueBefore = (billsDue + instalmentsDue) / 100;
  const buffer = Math.round(sepIn * p.safety_buffer_pct) / 100;
  console.log(
    `${p.name}: ${debts.filter((dbt) => dbt.profile_id === p.id).length} debts · ${mine.length} txns (Sep ${mine.filter((t) => t.txn_date.startsWith("2026-09")).length}) · ` +
      `Sep income RM ${sepIn.toFixed(2)} · Sep expense RM ${sepOut.toFixed(2)} · balance RM ${p.current_balance.toFixed(2)} · ` +
      `next income ${next.expected_date} · due before it RM ${dueBefore.toFixed(2)} · buffer RM ${buffer.toFixed(2)} · ` +
      `safe-to-spend before budget ≈ RM ${(p.current_balance - dueBefore - buffer).toFixed(2)}`
  );
}
console.log(`Wrote ${path.relative(root, seedPath)}`);

if (!dry) {
  const ref = process.env.SUPABASE_PROJECT_REF ??
    JSON.parse(readFileSync(path.join(root, "supabase/.temp/linked-project.json"), "utf8")).ref;
  execFileSync("supabase", ["db", "query", "--linked", "--project-ref", ref, "-f", seedPath], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`Seeded project ${ref}`);
}
