# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

FinanceBro AI: a Next.js 14 (App Router, TypeScript) + Supabase **PayLater (BNPL) tracker** for Malaysian students: Shopee PayLater, TikTok PayLater, Grab PayLater, Atome (all money in MYR). Live at https://finance-bro-iota.vercel.app. `TODO.md` is written in Malay and records design decisions from before the PayLater-only switch (expenses, bills and the business profile were dropped on 2026-10-16). Read it before you change debt or cash-flow behaviour.

## Commands

```bash
npm run dev                 # dev server (needs .env.local from .env.example)
npm test                    # vitest run: unit tests + DB integration tests
npx vitest run src/lib/debt/payments.test.ts   # one file
npx vitest run -t "partial" # tests whose name matches
npx tsc --noEmit            # typecheck (there is no lint script)
npm run build
npm run db:migrate          # applies every supabase/migrations/*.sql in order to the linked project (logged-in Supabase CLI)
npm run seed                # regenerates supabase/seed.sql and resets the live demo data; `npm run seed -- --dry` writes the file only
```

- There is no vitest config. Unit tests sit next to their code (`src/lib/**/*.test.ts`). `tests/debt-payments.int.test.ts` runs against the **real linked Supabase project**, using throwaway profiles that it deletes afterwards. It is skipped when `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are missing from the env or `.env.local`.
- `db:migrate` re-runs **all** migrations every time. Every migration must be idempotent (`if not exists`, `create or replace`). Later migrations redefine earlier functions (for example `record_debt_payment`, `create_debt`, `apply_txn_to_balance`), so the newest definition is the one that counts.
- `NEXT_DIST_DIR` lets a second dev server run from the same folder.

## Ground rules (they drive most of the design)

- **PayLater only.** One student profile and `bnpl` debts only. The `20261016000000_paylater_only` migration deleted the business profile and the bills (`commitments`), `budgets`, `reminders`, `reports` and `agent_runs` tables, and added check constraints (`profiles.mode = 'student'`, `debts.debt_type = 'bnpl'`). Because `db:migrate` re-runs every migration and the older ones re-create some of those objects, that migration must stay the last word: keep it safe to repeat, and put new schema changes after it.
- **The LLM decides, code calculates.** Every RM figure comes from pure TS functions or SQL, never from a model. Agent tools and pages call the same functions.
- **Nothing moves money.** The app only records payments the user already made.
- **Cash is context, not the product.** `transactions` still exists because every recorded PayLater payment writes a `Debt Repayment` transaction and the cash balance is built from the ledger. The cash balance is used only for "can you cover your instalments" and affordability. Credit purchases (`cash_effect = false`) never move cash; `netCash` in `src/lib/cashflow.ts` encodes this.
- Derived state is computed and not stored: overdue status and next due date come from instalment dates. Countdowns work in whole days in Malaysian time (`todayISO`).
- Show formulas and assumptions in the UI. Don't hide them.

## Architecture

**Data.** There is no auth. The browser uses the Supabase anon key, and every query filters on `profile_id`. The app uses the DB profile with `mode = 'student'` (Aina in the seed). `AppMode` is always `"individual"` in the app; `profileIdFor("individual")` resolves the id. `src/lib/db.ts` is the **only** place that maps DB rows (numeric strings, snake_case) to UI types in `src/lib/types.ts`.

**Money integrity lives in Postgres** (`supabase/migrations/`):
- The `transactions_balance` trigger keeps `profiles.current_balance` in sync and ignores `cash_effect = false` rows.
- Debts use three tables: `debts` → `debt_instalments` (schedule) → `debt_payments` (actual payments, each linked to a `transactions` row). A debt's `name` is the PayLater provider and `notes` holds what was bought.
- Multi-row debt changes go through SQL functions called with `supabase.rpc`: `create_debt`, `add_debt_instalments`, `record_debt_payment` (idempotency key + row lock, rejects overpayment and future dates, sets the debt to `paid_off` and cancels the remaining instalments), `update_debt_instalment`, `cancel_debt_instalment` and `reschedule_debt`. Paid and cancelled instalments are locked. Add new debt mutations as SQL functions with integration tests, not as client-side sequences.

**Client state.** `src/lib/FinanceContext.tsx` loads the profile on mount. Writes go to Supabase, and then the profile is re-fetched. A Realtime subscription re-fetches when anything else changes the data (for example the agent through MCP).

**Pure logic** (unit-tested; pages only display the results):
- `src/lib/debt/schedule.ts`: generates instalments (one-time, weekly, fortnightly, monthly, yearly). Short months clamp and then return to the original day, and the last instalment takes the remainder. Also handles irregular schedules and `planScheduleExtension`.
- `src/lib/debt/payments.ts`: the "To pay" list, countdowns, filters, per-provider grouping (`groupByCreditor`, `debtBreakdown`), `debtOverview` and `extraPaymentScenario`. `buildPayments` and `cashFlow` still accept bills; the app always passes `[]`.
- `src/lib/debt/agent.ts`: `answerDebtQuestion()`, the keyword fallback for chat when no agent engine is available.
- `src/lib/cashflow.ts`, `src/lib/safeToSpend.ts` and `src/lib/reports.ts` (`debtSchedule`): the money maths. Safe-to-spend (used by `check_affordability`) = balance + confirmed income before the next payday − instalments due before then − safety buffer (`profiles.safety_buffer_pct` of last month's income).

**AI (WorkBuddy/CodeBuddy over MCP).** FinanceBro has no LLM of its own.
- `POST /api/mcp` (`src/app/api/mcp/route.ts`) is a hand-written, stateless JSON-RPC MCP server. Tools are defined in `src/lib/agent/tools.ts` as `ToolDef`s (`write` flag, input schema, `run`). They take no `mode` argument; a `mode` sent by an older client is ignored. Tool calls are logged to `agent_activity`, which the `/agent` page shows live. Throw `ToolInputError` for bad input so the message goes back to the agent. `MCP_TOKEN` optionally locks the endpoint.
- `POST /api/chat` streams SSE. When `AGENT_SERVER_URL` is set (production), it proxies to `agent-server/server.mjs` on an always-on box. Otherwise it spawns the local `codebuddy` CLI via `src/lib/agent/runner.ts`, with only the financebro MCP tools allowed.
- `runner.ts` and `instructions.ts` are imported directly by `agent-server/server.mjs` through Node's type stripping (Node 22.18+). Keep them to **node builtins only, relative imports, no path aliases, no enums**. After you change them, copy them to the server (see `agent-server/README.md`).
- The agent rules exist in two places that must stay in sync: `src/lib/agent/instructions.ts` (sent on MCP `initialize`) and `workbuddy/financebro/SKILL.md` (the WorkBuddy desktop skill).

## Seed data

`scripts/seed.mjs` is deterministic (fixed PRNG) and builds one fictional student, Aina Rahman, with four PayLater plans: Shopee, TikTok, Atome and Grab. Her transactions exist only to build her cash balance. Rows are marked `is_sample`. The script prints the safe-to-spend inputs so you can check them by hand. `npm run seed` resets the live demo database (it applies through `supabase db query --linked`, so a logged-in, linked Supabase CLI is required).

## Branches

Work happens on `continuous-dev`. It is fast-forwarded to `beta` (preview deploys) and then `main` (production).
