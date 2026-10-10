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
tx(K, d(9, 20), "expense", 1150, "Operating Expenses", "Equipment loan – espresso machine", "bank");
tx(K, d(9, 18), "expense", 2140.6, "Operating Expenses", "Maybank Business card bill", "bank");
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
tx(S, d(9, 12), "expense", 89.9, "Shopping", "SPayLater – phone (instalment)", "ewallet");
tx(S, d(9, 14), "expense", 45.5, "Shopping", "SPayLater – headphones (instalment)", "ewallet");
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
  // Kopi Senja — RM 3,400 in supplier invoices due before the next payout
  { profile_id: K, name: "Kopi Bumi Roasters – invoice KBR-1001", kind: "supplier", amount: 1680, due_date: d(10, 12), recurrence: "none" },
  { profile_id: K, name: "Farm Fresh – milk invoice", kind: "supplier", amount: 940, due_date: d(10, 13), recurrence: "none" },
  { profile_id: K, name: "EcoPack – packaging invoice", kind: "supplier", amount: 780, due_date: d(10, 14), recurrence: "none" },
  { profile_id: K, name: "Shoplot rent", kind: "rent", amount: 3200, due_date: d(10, 15), recurrence: "monthly" },
  { profile_id: K, name: "Maybank Business card", kind: "credit_card", amount: 2350, due_date: d(10, 18), recurrence: "monthly", outstanding_balance: 2350 },
  { profile_id: K, name: "Equipment loan – espresso machine", kind: "loan", amount: 1150, due_date: d(10, 20), recurrence: "monthly", instalments_left: 14, outstanding_balance: 16100 },
  { profile_id: K, name: "TNB electricity", kind: "bill", amount: 620, due_date: d(10, 22), recurrence: "monthly" },
  { profile_id: K, name: "Unifi Business", kind: "bill", amount: 199, due_date: d(10, 7), recurrence: "monthly", status: "overdue" },
  // Student
  { profile_id: S, name: "Room rent share", kind: "rent", amount: 450, due_date: d(10, 11), recurrence: "monthly" },
  { profile_id: S, name: "SPayLater – phone", kind: "bnpl", amount: 89.9, due_date: d(10, 12), recurrence: "monthly", instalments_left: 4, outstanding_balance: 359.6 },
  { profile_id: S, name: "CelcomDigi postpaid", kind: "bill", amount: 48, due_date: d(10, 13), recurrence: "monthly" },
  { profile_id: S, name: "SPayLater – headphones", kind: "bnpl", amount: 45.5, due_date: d(10, 14), recurrence: "monthly", instalments_left: 2, outstanding_balance: 91 },
];

const income = [
  { profile_id: K, source: "sales", expected_amount: 7800, expected_date: d(10, 16), confirmed: true },
  { profile_id: K, source: "sales", expected_amount: 8200, expected_date: d(10, 31), confirmed: false },
  { profile_id: S, source: "allowance", expected_amount: 600, expected_date: d(10, 15), confirmed: true },
  { profile_id: S, source: "other", expected_amount: 230, expected_date: d(10, 26), confirmed: false },
  { profile_id: S, source: "PTPTN", expected_amount: 2250, expected_date: d(11, 3), confirmed: false },
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
  const sepOut = sum((t) => t.direction === "expense" && t.txn_date.startsWith("2026-09"));
  const next = income.filter((i) => i.profile_id === p.id).sort((a, b) => a.expected_date.localeCompare(b.expected_date))[0];
  const dueBefore = commitments
    .filter((c) => c.profile_id === p.id && c.status !== "paid" && c.due_date < next.expected_date)
    .reduce((a, c) => a + cents(c.amount), 0) / 100;
  const buffer = Math.round(sepIn * p.safety_buffer_pct) / 100;
  console.log(
    `${p.name}: ${mine.length} txns (Sep ${mine.filter((t) => t.txn_date.startsWith("2026-09")).length}) · ` +
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
