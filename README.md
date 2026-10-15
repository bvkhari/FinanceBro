# FinanceBro AI

A PayLater (Buy Now, Pay Later) tracker for Malaysian university students. It keeps every Shopee PayLater, TikTok PayLater, Grab PayLater and Atome plan in one place, in MYR, and tells you what's due, what's overdue, whether you can cover it, and how to clear it.

Built in 24 hours at Hackerdorm (Track 2, WorkBuddy Agentic Solutions), starting 2026-10-10.

- **Live app:** https://finance-bro-iota.vercel.app
- **Demo profile:** **Aina Rahman**, a student with four PayLater plans. Fictional seed data.

## What it does

| Page | What you get |
|---|---|
| **Dashboard** (`/`) | What to pay in the next 30 and 7 days, what's overdue, total owed and the split by provider, who to pay first, and whether your cash covers the instalments due this month. |
| **PayLater** (`/payments`) | One "To pay" list of instalments grouped by provider, every plan with its schedule, adding a plan, rescheduling, recording payments and "what if I pay extra". |
| **Reports** (`/reports`) | The PayLater schedule: each plan and every instalment still to pay, month by month. CSV or PDF. |
| **FinanceBro AI** (`/financebro-ai`) | Chat with the WorkBuddy agent. Attach a PayLater checkout or bill and it keys it in. Its tool calls show as live steps. |
| **WorkBuddy Agent** (`/agent`) | Connector setup and a live feed of every tool call the agent makes. |

### Ground rules

- **PayLater only.** No expense tracking, budgets, bills, cards or loans. The cash balance is kept only to show whether the instalments are covered.
- **The LLM decides, code calculates.** Every RM figure comes from TypeScript or SQL, never from the model.
- **Nothing moves money.** The app records payments you made. It never pays anyone.
- **Month-end projection** = cash now + confirmed income − PayLater instalments due by month end (overdue included). Never the whole amount owed.

## The AI: WorkBuddy over MCP

FinanceBro has no LLM of its own. WorkBuddy (the track sponsor's agent) does the reasoning, and FinanceBro gives it tools over MCP.

```
Browser ─► /api/chat ─► CodeBuddy / WorkBuddy engine ─► /api/mcp (FinanceBro tools) ─► Supabase
```

- **`POST /api/mcp`** is a stateless MCP server. Tools live in `src/lib/agent/tools.ts`: reads (`get_snapshot`, `list_debts`, `list_payments_due`, `check_affordability`, `debt_payoff_scenario`, `generate_report`) and writes (`add_debt`, `record_debt_payment`, `add_expected_income`).
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
| `npm run seed` | Regenerates `supabase/seed.sql` and resets the demo data (`-- --dry` writes the file only) |

## Project layout

```
src/app/            pages and API routes (api/mcp, api/chat)
src/lib/db.ts       the only mapping between DB rows and UI types
src/lib/debt/       pure schedule, payments and PayLater-answer logic
src/lib/agent/      MCP tools, agent instructions and the engine runner
src/lib/cashflow.ts, safeToSpend.ts   the money maths
supabase/           migrations and generated seed
scripts/seed.mjs    deterministic demo data
agent-server/       always-on host for the agent engine
workbuddy/          WorkBuddy connector setup and skill
tests/              Supabase integration tests
```

## Status

Done: PayLater plans with schedules and idempotent payments, the PayLater page, dashboard, schedule report, and the WorkBuddy agent with MCP tools and live activity feed.

The app used to also track expenses, budgets, bills and a business profile. Those tables (and the Kopi Senja café profile) are still in the database but nothing loads them. Progress before the switch is in [TODO.md](TODO.md).

## Branches

Work happens on `continuous-dev`, then is fast-forwarded to `beta` (preview deploys) and `main` (production).
