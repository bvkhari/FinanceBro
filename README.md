# FinanceBro AI

An AI finance agent for Malaysian university students and small-business owners. It tracks cash, spending, bills and debts in MYR, and tells you what is due, what you can safely spend, and how your debts pay down.

Built in 24 hours at Hackerdorm (Track 2, WorkBuddy Agentic Solutions), starting 2026-10-10.

- **Live app:** https://finance-bro-iota.vercel.app
- **Two demo profiles**, switched from the top bar: **Aina Rahman** (student) and **Kopi Senja** (café). Both are fictional seed data.

## What it does

| Page | What you get |
|---|---|
| **Dashboard** (`/`) | Debt workspace first: next payment, due in 7 days, due this month, overdue and outstanding debt, each split by creditor. Expenses tab with balance, cash flow and spending. |
| **Payments** (`/payments`) | One "To pay" list for debt instalments and bills, grouped by creditor. Debts and Bills tabs, schedule editing, rescheduling and payment recording. |
| **Reports** (`/reports`) | Monthly summary, spending by category and the debt schedule. |
| **Transactions** (`/transactions`) | The ledger, with categories, edits and duplicate checks. |
| **FinanceBro AI** (`/financebro-ai`) | Chat with the WorkBuddy agent. Its tool calls show as live steps. |
| **WorkBuddy Agent** (`/agent`) | Connector setup and a live feed of every tool call the agent makes. |

### Ground rules

- **The LLM decides, code calculates.** Every RM figure comes from TypeScript or SQL, never from the model.
- **Nothing moves money.** The app records payments you made. It never pays anyone.
- **Every ringgit counts once.** A credit purchase is spending but not cash. A debt repayment is cash but not spending. Only interest and fees are both.
- **Safe-to-spend** = balance + confirmed income before next payday − unpaid bills due before then − remaining essential budget − safety buffer.

## The AI: WorkBuddy over MCP

FinanceBro has no LLM of its own. WorkBuddy (the track sponsor's agent) does the reasoning, and FinanceBro gives it tools over MCP.

```
Browser ─► /api/chat ─► CodeBuddy / WorkBuddy engine ─► /api/mcp (FinanceBro tools) ─► Supabase
```

- **`POST /api/mcp`** is a stateless MCP server. Tools live in `src/lib/agent/tools.ts`: reads (`get_snapshot`, `list_*`, `monthly_report`, `check_affordability`, `debt_payoff_scenario`) and writes (`add_transactions`, `update_transaction`, `set_budgets`, `add_bill`, `mark_bill_paid`, `add_debt`, `record_debt_payment`, `add_expected_income`).
- **`POST /api/chat`** runs the CodeBuddy engine headless and streams its steps. In production it proxies to an always-on [agent server](agent-server/README.md). With no engine, the chat falls back to built-in keyword answers.
- **Use it from the WorkBuddy desktop app:** see [workbuddy/README.md](workbuddy/README.md) for the connector and skill.

## Stack

Next.js 14 (App Router, TypeScript), Tailwind, Recharts, lucide icons, Supabase (Postgres + Realtime), Vitest. Deployed on Vercel.

## Run it locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then:

```bash
npm run dev
```

The chat needs a signed-in CodeBuddy CLI (`codebuddy` → `/login`) on the same machine. Without it, the chat uses the keyword fallback.

### Other commands

| Command | Does |
|---|---|
| `npm test` | Unit tests, plus integration tests against Supabase when the env vars are set |
| `npx tsc --noEmit` | Typecheck |
| `npm run build` | Production build |
| `npm run db:migrate` | Applies `supabase/migrations/` to the linked project (needs a logged-in Supabase CLI) |
| `npm run seed` | Regenerates `supabase/seed.sql` and resets both demo profiles (`-- --dry` writes the file only) |

## Project layout

```
src/app/            pages and API routes (api/mcp, api/chat)
src/lib/db.ts       the only mapping between DB rows and UI types
src/lib/debt/       pure schedule, payments and debt-answer logic
src/lib/agent/      MCP tools, agent instructions and the engine runner
src/lib/cashflow.ts, safeToSpend.ts   the money maths
supabase/           migrations and generated seed
scripts/seed.mjs    deterministic demo data
agent-server/       always-on host for the agent engine
workbuddy/          WorkBuddy connector setup and skill
tests/              Supabase integration tests
```

## Status

Done: debt model with schedules and idempotent payments, Payments page, dashboard, reports, transactions, the WorkBuddy agent with MCP tools and live activity feed.

Not built yet: Excel export with live formulas, `.ics` reminders, and safe-to-spend on the dashboard (only the agent tools use it so far). Progress is tracked in [TODO.md](TODO.md).

## Branches

Work happens on `continuous-dev`, then is fast-forwarded to `beta` (preview deploys) and `main` (production).
