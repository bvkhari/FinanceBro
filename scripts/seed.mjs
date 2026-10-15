#!/usr/bin/env node
// FinanceBro AI — seed data for the demo student, Aina, and her PayLater plans.
//
//   npm run seed          regenerate supabase/seed.sql and apply it to the linked project
//   npm run seed -- --dry regenerate supabase/seed.sql only
//
// The data is deterministic (fixed PRNG seed), so every reset gives the same numbers.
// Applying goes through `supabase db query --linked` (Management API over HTTPS), so it
// works even where direct Postgres ports are blocked. Requires a logged-in Supabase CLI.
//
// The script prints the safe-to-spend inputs so you can check them by hand.

import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateSchedule, normaliseIrregularSchedule } from "../src/lib/debt/schedule.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");

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
// Student — Aina, uni student on allowance + part-time tutoring
// ======================================================================
const S = STUDENT_ID;

// Aina's amounts are whole ringgit and her monthly totals are round, so the pitch numbers are easy
// to follow: September income RM1,000, cash spending RM1,000. The app shows only her PayLater plans;
// these transactions are what her cash balance is built from.
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

// ---------- profile and expected income ----------
const profiles = [
  { id: S, name: "Aina Rahman", mode: "student", current_balance: 720, safety_buffer_pct: 10 },
];

const income = [
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
  // Aina — four BNPL apps, one plan each. The story: RM940 still owed, RM540 due
  // this month, TikTok's 5 Oct instalment is already overdue and Grab's is due on 12 Oct.
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
  { id: debtId(4), profile_id: S, name: "Grab PayLater", debt_type: "bnpl", original_amount: 180, repayment_amount: 60,
    frequency: "monthly", schedule: monthly(180, 60, d(10, 12)), notes: "Bluetooth speaker from GrabMart, RM60 × 3 months",
    start_date: d(9, 12), end_date: d(12, 12),
    purchase: { txn_date: d(9, 12), category: "Shopping", note: "Bluetooth speaker (Grab PayLater)" } },
];

// ---------- SQL ----------
const lit = (v) =>
  v === undefined || v === null ? "null"
  : typeof v === "number" ? v.toFixed(2).replace(/\.00$/, "")
  : typeof v === "boolean" ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;

function insert(table, rows, cols) {
  const values = rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`);
  return `insert into ${table} (${cols.join(", ")}) values\n${values.join(",\n")};\n`;
}

txns.sort((a, b) => a.profile_id.localeCompare(b.profile_id) || a.txn_date.localeCompare(b.txn_date));
txns.forEach((t, i) => (t.created_at = `${t.txn_date}T${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00+08`));

const sql = `-- Generated by scripts/seed.mjs — do not edit by hand. Run \`npm run seed\`.
begin;

delete from profiles where id = ${lit(S)};

${insert("profiles", profiles, ["id", "name", "mode", "current_balance", "safety_buffer_pct"])}
${insert("transactions", txns, ["profile_id", "txn_date", "direction", "amount", "category", "merchant", "source", "note", "created_at"])}
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
  const instalmentsDue = debts
    .filter((dbt) => dbt.profile_id === p.id)
    .flatMap((dbt) => dbt.schedule.filter((i) => !(dbt.paid ?? []).includes(i.due_date)))
    .filter((i) => i.due_date < next.expected_date)
    .reduce((a, i) => a + cents(i.amount), 0);
  const dueBefore = instalmentsDue / 100;
  const buffer = Math.round(sepIn * p.safety_buffer_pct) / 100;
  console.log(
    `${p.name}: ${debts.filter((dbt) => dbt.profile_id === p.id).length} debts · ${mine.length} txns (Sep ${mine.filter((t) => t.txn_date.startsWith("2026-09")).length}) · ` +
      `Sep income RM ${sepIn.toFixed(2)} · Sep expense RM ${sepOut.toFixed(2)} · balance RM ${p.current_balance.toFixed(2)} · ` +
      `next income ${next.expected_date} · due before it RM ${dueBefore.toFixed(2)} · buffer RM ${buffer.toFixed(2)} · ` +
      `safe-to-spend ≈ RM ${(p.current_balance - dueBefore - buffer).toFixed(2)}`
  );
}
console.log(`Wrote ${path.relative(root, seedPath)}`);

if (!dry) {
  const ref = process.env.SUPABASE_PROJECT_REF ??
    JSON.parse(readFileSync(path.join(root, "supabase/.temp/linked-project.json"), "utf8")).ref;
  execFileSync("supabase", ["db", "query", "--linked", "--project-ref", ref, "-f", seedPath], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`Seeded project ${ref}`);
}
