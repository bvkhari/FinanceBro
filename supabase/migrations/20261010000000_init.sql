-- FinanceBro AI — initial schema (Doc 4: Data Model).
-- Amounts are numeric(12,2) in MYR. Every table carries profile_id.
-- No auth for the hackathon: RLS is off and the anon role has full access (RLS is a roadmap item).

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null check (mode in ('student', 'business')),
  currency text not null default 'MYR',
  current_balance numeric(12,2) not null default 0,
  safety_buffer_pct numeric(5,2) not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  txn_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  direction text not null check (direction in ('income', 'expense')),
  category text not null default 'Uncategorised',
  merchant text not null,
  source text not null default 'manual' check (source in ('bank', 'ewallet', 'cash', 'manual')),
  note text,
  flag text check (flag in ('duplicate', 'unusual')),
  created_by text not null default 'user' check (created_by in ('user', 'agent')),
  created_at timestamptz not null default now()
);
create index if not exists transactions_profile_date_idx on transactions (profile_id, txn_date desc);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category text not null,
  limit_amount numeric(12,2) not null check (limit_amount >= 0),
  essential boolean not null default false,
  created_by text not null default 'user' check (created_by in ('user', 'agent')),
  created_at timestamptz not null default now(),
  unique (profile_id, month, category)
);

create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bill', 'bnpl', 'loan', 'credit_card', 'supplier', 'rent', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  recurrence text not null default 'none' check (recurrence in ('none', 'monthly')),
  instalments_left int,
  outstanding_balance numeric(12,2),
  status text not null default 'upcoming' check (status in ('upcoming', 'paid', 'overdue')),
  created_at timestamptz not null default now()
);
create index if not exists commitments_profile_due_idx on commitments (profile_id, due_date);

create table if not exists income_schedule (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('allowance', 'salary', 'PTPTN', 'sales', 'other')),
  expected_amount numeric(12,2) not null check (expected_amount > 0),
  expected_date date not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  commitment_id uuid not null references commitments(id) on delete cascade,
  remind_at timestamptz not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'calendar')),
  status text not null default 'scheduled' check (status in ('scheduled', 'sent')),
  created_by text not null default 'agent' check (created_by in ('user', 'agent')),
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  goal text not null,
  plan jsonb,
  steps jsonb[] not null default '{}',
  checks jsonb[] not null default '{}',
  status text not null default 'running' check (status in ('running', 'needs_fix', 'done', 'failed')),
  summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete set null,
  period text not null,
  xlsx_path text,
  ics_path text,
  created_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

-- Realtime: the dashboard subscribes to these tables.
do $$
declare t text;
begin
  foreach t in array array['profiles','transactions','budgets','commitments','income_schedule','reminders','agent_runs','reports'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
