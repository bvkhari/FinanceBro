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

// ======================================================================
// Kopi Senja — café, ~RM 28k/month revenue
// ======================================================================
const K = KOPI_SENJA_ID;

function kopiMonth(m, lastDay) {
  for (let day = 1; day <= lastDay; day++) {
    const date = d(m, day);
    const w = dow(date);
    if (w === 1) {
      // Closed on Mondays; the weekly QR/card processing fee still posts
      tx(K, date, "expense", between(38, 52), "Operating Expenses", "Maybank QR MDR fee", "bank");
      continue;
    }
    const weekend = w === 0 || w === 6;
    tx(K, date, "income", weekend ? between(950, 1200) : between(620, 800),
      "Sales Revenue", "Daily sales (cash + DuitNow QR)", "bank");
    tx(K, date, "expense", between(25, 40), "Ingredients", "Ice supply", "cash");
    if (w === 3) tx(K, date, "income", between(1200, 1450), "Delivery Sales", "GrabFood payout", "bank");
    if (w === 2 || w === 5) tx(K, date, "expense", between(240, 300), "Ingredients", "Farm Fresh (milk)", "bank");
    if (w === 4) tx(K, date, "expense", between(560, 640), "Ingredients", "Kopi Bumi Roasters", "bank");
    if (w === 0 || w === 3) tx(K, date, "expense", between(240, 290), "Ingredients", "Roti Mak Teh (pastries)", "bank");
    if (w === 5) tx(K, date, "expense", between(60, 110), "Ingredients", "Pasar borong (fruit, pandan)", "cash");
    if (w === 6) tx(K, date, "expense", between(90, 160), "Ingredients", pick(["Lotus's", "NSK Trade City", "Mydin"]), "cash");
    if (w === 0) tx(K, date, "expense", between(35, 70), "Operating Expenses", "Cleaning supplies", "cash");
  }
}

kopiMonth(9, 30);
// Monthly September costs
tx(K, d(9, 2), "expense", 3200, "Rent", "Shoplot rent – Tmn Tun Dr Ismail", "bank");
tx(K, d(9, 3), "expense", 340.5, "Packaging", "EcoPack Supplies", "bank");
tx(K, d(9, 17), "expense", 385.2, "Packaging", "EcoPack Supplies", "bank");
tx(K, d(9, 15), "expense", 3750, "Wages", "Staff wages (1–15 Sep)", "bank");
tx(K, d(9, 30), "expense", 3750, "Wages", "Staff wages (16–30 Sep)", "bank");
tx(K, d(9, 22), "expense", 588.4, "Utilities", "TNB electricity", "bank");
tx(K, d(9, 24), "expense", 72.3, "Utilities", "Air Selangor", "bank");
tx(K, d(9, 7), "expense", 199, "Utilities", "Unifi Business", "bank");
tx(K, d(9, 5), "expense", 150, "Marketing", "Meta ads", "bank");
tx(K, d(9, 19), "expense", 150, "Marketing", "Meta ads", "bank");
tx(K, d(9, 11), "expense", 115, "Operating Expenses", "LPG gas cylinder", "cash");
tx(K, d(9, 25), "expense", 115, "Operating Expenses", "LPG gas cylinder", "cash");
tx(K, d(9, 9), "expense", 280, "Operating Expenses", "Espresso machine service", "bank");
// August statement, paid before debts were tracked in the app (not linked to a debt record)
tx(K, d(9, 18), "expense", 2140.6, "Debt Repayment", "Maybank Business card bill", "bank");
// Planted duplicate supplier charge (same merchant, date and amount; flag left empty for the agent)
tx(K, d(9, 24), "expense", 612, "Ingredients", "Kopi Bumi Roasters", "bank", { note: "Invoice KBR-0924" });
tx(K, d(9, 24), "expense", 612, "Ingredients", "Kopi Bumi Roasters", "bank", { note: "Invoice KBR-0924" });
// Uncategorised rows for the agent to fix
tx(K, d(9, 8), "expense", 150, "Uncategorised", "DuitNow transfer – AHMAD BIN K", "bank");
tx(K, d(9, 13), "expense", 86.9, "Uncategorised", "POS 4412 MR DIY", "bank");
tx(K, d(9, 27), "expense", 42, "Uncategorised", "QR payment SERI MURNI", "ewallet");

kopiMonth(10, 9);
tx(K, d(10, 6), "expense", 150, "Marketing", "Meta ads", "bank");

// ======================================================================
// Student — Aina, uni student on allowance + part-time tutoring
// ======================================================================
const S = STUDENT_ID;

const foodSpots = ["Mamak Bistro", "Kafe Fakulti", "GrabFood", "Tealive", "Nasi Kandar Pelita", "7-Eleven", "FamilyMart"];
function studentMonth(m, lastDay) {
  for (let day = 1; day <= lastDay; day++) {
    const date = d(m, day);
    if (rand() < 0.9) {
      const spot = pick(foodSpots);
      tx(S, date, "expense", spot === "GrabFood" ? between(14, 26) : between(6, 16), "Food", spot, spot === "GrabFood" ? "ewallet" : pick(["cash", "ewallet"]));
    }
    if (day % 4 === 2) tx(S, date, "expense", between(4, 15), "Transportation", pick(["Grab ride", "Rapid KL (LRT)"]), "ewallet");
  }
}

studentMonth(9, 30);
tx(S, d(9, 1), "income", 600, "Allowance", "Transfer from Mak", "bank");
tx(S, d(9, 14), "income", 220, "Part-time income", "Tutoring – Cikgu Online", "bank");
tx(S, d(9, 28), "income", 230, "Part-time income", "Tutoring – Cikgu Online", "bank");
tx(S, d(9, 11), "expense", 450, "Rent", "Room rent share", "bank");
tx(S, d(9, 13), "expense", 48, "Utilities", "CelcomDigi postpaid", "bank");
tx(S, d(9, 3), "expense", 15.9, "Subscriptions", "Spotify Student", "bank");
tx(S, d(9, 5), "expense", 52.8, "Subscriptions", "Adobe Creative Cloud", "bank"); // the forgotten subscription
tx(S, d(9, 9), "expense", 3.9, "Subscriptions", "iCloud+", "bank");
tx(S, d(9, 6), "expense", 64.9, "Shopping", "Shopee", "ewallet");
tx(S, d(9, 21), "expense", 39.0, "Shopping", "Shopee", "ewallet");
tx(S, d(9, 13), "expense", 32, "Entertainment", "GSC cinema", "ewallet");
tx(S, d(9, 10), "expense", 12.5, "Education", "Printing & binding", "cash");
tx(S, d(9, 24), "expense", 28, "Education", "Lab manual", "cash");
tx(S, d(9, 19), "expense", 25, "Uncategorised", "DuitNow transfer – NUR A", "bank");
tx(S, d(9, 26), "expense", 18, "Uncategorised", "TNG eWallet reload", "ewallet");

studentMonth(10, 9);
tx(S, d(10, 3), "expense", 15.9, "Subscriptions", "Spotify Student", "bank");
tx(S, d(10, 5), "expense", 52.8, "Subscriptions", "Adobe Creative Cloud", "bank");
tx(S, d(10, 8), "expense", 27.9, "Shopping", "Shopee", "ewallet");

// ---------- profiles, budgets, commitments, income ----------
const profiles = [
  { id: K, name: "Kopi Senja", mode: "business", current_balance: 9400, safety_buffer_pct: 10 },
  { id: S, name: "Aina Rahman", mode: "student", current_balance: 720, safety_buffer_pct: 10 },
];

// September budgets only — the agent creates October's.
const budgets = [
  [K, "Ingredients", 6500, true], [K, "Packaging", 800, true], [K, "Wages", 7500, true],
  [K, "Rent", 3200, true], [K, "Utilities", 900, true], [K, "Marketing", 400, false],
  [K, "Operating Expenses", 3600, false],
  [S, "Food", 380, true], [S, "Transportation", 90, true], [S, "Rent", 450, true],
  [S, "Utilities", 50, true], [S, "Shopping", 150, false], [S, "Subscriptions", 25, false],
  [S, "Entertainment", 40, false], [S, "Education", 40, true],
].map(([profile_id, category, limit_amount, essential]) => ({
  profile_id, month: "2026-09-01", category, limit_amount, essential,
}));

const commitments = [
  // Bills only. BNPL, loans, cards and supplier invoices live in `debts` below.
  { profile_id: K, name: "Shoplot rent", kind: "rent", amount: 3200, due_date: d(10, 15), recurrence: "monthly" },
  { profile_id: K, name: "TNB electricity", kind: "bill", amount: 620, due_date: d(10, 22), recurrence: "monthly" },
  { profile_id: K, name: "Unifi Business", kind: "bill", amount: 199, due_date: d(10, 7), recurrence: "monthly", status: "overdue" },
  // Student
  { profile_id: S, name: "Room rent share", kind: "rent", amount: 450, due_date: d(10, 11), recurrence: "monthly" },
  { profile_id: S, name: "CelcomDigi postpaid", kind: "bill", amount: 48, due_date: d(10, 13), recurrence: "monthly" },
];

const income = [
  { profile_id: K, source: "sales", expected_amount: 7800, expected_date: d(10, 16), confirmed: true },
  { profile_id: K, source: "sales", expected_amount: 8200, expected_date: d(10, 31), confirmed: false },
  { profile_id: S, source: "allowance", expected_amount: 600, expected_date: d(10, 15), confirmed: true },
  { profile_id: S, source: "other", expected_amount: 230, expected_date: d(10, 26), confirmed: false },
  { profile_id: S, source: "PTPTN", expected_amount: 2250, expected_date: d(11, 3), confirmed: false },
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
  // Student
  { id: debtId(1), profile_id: S, name: "Shopee PayLater", debt_type: "bnpl", original_amount: 300, repayment_amount: 100,
    frequency: "monthly", schedule: monthly(300, 100, d(10, 15)), notes: "Wireless earbuds, 3 monthly instalments",
    purchase: { txn_date: d(9, 15), category: "Shopping", note: "Wireless earbuds (Shopee PayLater)" } },
  { id: debtId(2), profile_id: S, name: "SPayLater – phone", debt_type: "bnpl", original_amount: 539.4, repayment_amount: 89.9,
    frequency: "monthly", schedule: monthly(539.4, 89.9, "2026-08-12"), paid: ["2026-08-12", d(9, 12)],
    start_date: "2026-07-12", end_date: "2027-01-12",
    purchase: { txn_date: "2026-07-12", category: "Shopping", note: "Phone (SPayLater, 6 months)" } },
  { id: debtId(3), profile_id: S, name: "SPayLater – headphones", debt_type: "bnpl", original_amount: 182, repayment_amount: 45.5,
    frequency: "monthly", schedule: monthly(182, 45.5, "2026-08-14"), paid: ["2026-08-14", d(9, 14)],
    start_date: "2026-07-14", end_date: "2026-11-14",
    purchase: { txn_date: "2026-07-14", category: "Shopping", note: "Headphones (SPayLater, 4 months)" } },
  { id: debtId(4), profile_id: S, name: "Grab PayLater", debt_type: "bnpl", original_amount: 64.2, frequency: "one_time",
    schedule: once(64.2, d(10, 31)), notes: "September rides and GrabFood",
    purchase: { txn_date: d(9, 30), category: "Transportation", note: "September Grab rides (Grab PayLater)" } },
  { id: debtId(5), profile_id: S, name: "Abang Hafiz", debt_type: "family_friend", original_amount: 200, frequency: "irregular",
    schedule: normaliseIrregularSchedule([{ due_date: d(10, 25), amount: 80 }, { due_date: d(11, 25), amount: 120 }]),
    notes: "Borrowed for textbooks. No interest; pay when allowance comes in." },
  // Kopi Senja — RM 3,400 in supplier invoices due before the next payout
  { id: debtId(11), profile_id: K, name: "Kopi Bumi Roasters", debt_type: "supplier_invoice", original_amount: 1680,
    frequency: "one_time", schedule: once(1680, d(10, 12)), reference_no: "KBR-1001", notes: "Arabica + robusta beans, 30-day terms",
    purchase: { txn_date: d(9, 12), category: "Ingredients", note: "Beans on 30-day terms (invoice KBR-1001)" } },
  { id: debtId(12), profile_id: K, name: "Farm Fresh", debt_type: "supplier_invoice", original_amount: 940,
    frequency: "one_time", schedule: once(940, d(10, 13)), reference_no: "FF-88213", notes: "Fresh milk, September deliveries",
    purchase: { txn_date: d(9, 13), category: "Ingredients", note: "Milk on credit (invoice FF-88213)" } },
  { id: debtId(13), profile_id: K, name: "EcoPack Supplies", debt_type: "supplier_invoice", original_amount: 780,
    frequency: "one_time", schedule: once(780, d(10, 14)), reference_no: "EP-2026-311", notes: "Cups, lids and paper bags",
    purchase: { txn_date: d(9, 14), category: "Packaging", note: "Packaging on credit (invoice EP-2026-311)" } },
  { id: debtId(14), profile_id: K, name: "Maybank Business card", debt_type: "business_credit_card", original_amount: 2350,
    frequency: "one_time", schedule: once(2350, d(10, 18)), reference_no: "Statement Sep 2026", interest_rate: 15,
    notes: "Full statement balance; interest applies only if not paid in full",
    purchase: { txn_date: d(9, 30), category: "Operating Expenses", note: "September card purchases (statement)" } },
  { id: debtId(15), profile_id: K, name: "Hong Leong Bank – espresso machine", debt_type: "equipment_financing", original_amount: 27600,
    repayment_amount: 1150, frequency: "monthly", schedule: monthly(27600, 1150, "2025-12-20"),
    paid: ["2025-12-20", "2026-01-20", "2026-02-20", "2026-03-20", "2026-04-20", "2026-05-20", "2026-06-20", "2026-07-20", "2026-08-20", d(9, 20)],
    start_date: "2025-11-20", end_date: "2027-11-20", reference_no: "HLB-EF-55102" },
  { id: debtId(16), profile_id: K, name: "SME Bank – working capital loan", debt_type: "business_loan", original_amount: 30000,
    outstanding_balance: 18400, repayment_amount: 920, frequency: "monthly", schedule: monthly(18400, 920, d(10, 28)),
    start_date: "2025-03-28", reference_no: "SMEB-WC-7781", notes: "Repayments before October 2026 were not tracked in the app" },
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
