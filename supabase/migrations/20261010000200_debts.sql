-- Debt management: debts, their repayment schedules, and the payments made.
--   debts              what is owed (outstanding_balance) and the repayment terms
--   debt_instalments   the schedule: one row per due date (scheduled amount, amount paid)
--   debt_payments      each confirmed payment, linked to the cash transaction(s) it created
-- Overdue is derived from due_date at read time, never stored, so it can't go stale.
-- Payments only go through record_debt_payment(), which is idempotent.

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,                                  -- provider / creditor / supplier
  debt_type text not null check (debt_type in (
    -- personal (student profile)
    'bnpl', 'credit_card', 'personal_loan', 'car_loan', 'housing_loan', 'student_loan', 'family_friend', 'other_personal',
    -- business
    'business_loan', 'business_credit_card', 'equipment_financing', 'supplier_invoice', 'overdraft', 'other_business'
  )),
  original_amount numeric(12,2) not null check (original_amount > 0),
  outstanding_balance numeric(12,2) not null check (outstanding_balance >= 0),
  repayment_amount numeric(12,2) check (repayment_amount > 0),   -- null for irregular schedules
  frequency text not null check (frequency in ('one_time', 'weekly', 'biweekly', 'monthly', 'yearly', 'irregular')),
  interest_rate numeric(6,3) check (interest_rate >= 0),           -- % per year, only when known
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'paid_off', 'cancelled')),
  reference_no text,                                   -- invoice / account / agreement number
  notes text,
  is_sample boolean not null default false,            -- fictional demo record
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (outstanding_balance <= original_amount)
);
create index if not exists debts_profile_idx on debts (profile_id, status);

create table if not exists debt_instalments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  due_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0 and amount_paid <= amount),
  paid_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'partial', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (debt_id, due_date)
);
create index if not exists debt_instalments_profile_due_idx on debt_instalments (profile_id, due_date);

create table if not exists debt_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  instalment_id uuid not null references debt_instalments(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),              -- cash paid
  principal_amount numeric(12,2) not null check (principal_amount >= 0),
  interest_amount numeric(12,2) not null default 0 check (interest_amount >= 0),  -- interest + fees
  paid_date date not null,
  transaction_id uuid references transactions(id) on delete set null,           -- principal cash-out
  interest_transaction_id uuid references transactions(id) on delete set null,  -- interest/fee expense
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (principal_amount + interest_amount = amount)
);
create index if not exists debt_payments_debt_idx on debt_payments (debt_id, paid_date);

-- Personal debt types only on student profiles, business types only on business profiles.
create or replace function check_debt_type_matches_profile() returns trigger
language plpgsql as $$
declare
  m text;
begin
  select mode into m from profiles where id = new.profile_id;
  if (m = 'business') <> (new.debt_type in ('business_loan', 'business_credit_card', 'equipment_financing', 'supplier_invoice', 'overdraft', 'other_business')) then
    raise exception 'Debt type % does not belong on a % profile', new.debt_type, m;
  end if;
  return new;
end $$;

drop trigger if exists debts_type_matches_profile on debts;
create trigger debts_type_matches_profile
  before insert or update of debt_type, profile_id on debts
  for each row execute function check_debt_type_matches_profile();

-- Creates a debt and its schedule in one transaction.
-- p_debt: debt columns as JSON (id optional). p_instalments: [{due_date, amount}].
create or replace function create_debt(p_debt jsonb, p_instalments jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid := coalesce((p_debt->>'id')::uuid, gen_random_uuid());
  v_profile uuid := (p_debt->>'profile_id')::uuid;
begin
  if jsonb_array_length(coalesce(p_instalments, '[]')) = 0 then
    raise exception 'A debt needs at least one instalment';
  end if;

  insert into debts (id, profile_id, name, debt_type, original_amount, outstanding_balance, repayment_amount,
                     frequency, interest_rate, start_date, end_date, reference_no, notes, is_sample)
  values (v_id, v_profile, p_debt->>'name', p_debt->>'debt_type',
          (p_debt->>'original_amount')::numeric,
          coalesce((p_debt->>'outstanding_balance')::numeric, (p_debt->>'original_amount')::numeric),
          (p_debt->>'repayment_amount')::numeric, p_debt->>'frequency',
          (p_debt->>'interest_rate')::numeric, (p_debt->>'start_date')::date, (p_debt->>'end_date')::date,
          p_debt->>'reference_no', p_debt->>'notes', coalesce((p_debt->>'is_sample')::boolean, false));

  insert into debt_instalments (debt_id, profile_id, due_date, amount)
  select v_id, v_profile, (i->>'due_date')::date, (i->>'amount')::numeric
  from jsonb_array_elements(p_instalments) i;

  return v_id;
end $$;

-- Adds instalments to an existing debt. A due date that already exists is
-- skipped, so paid history is never touched and nothing is duplicated.
-- Returns how many instalments were added.
create or replace function add_debt_instalments(p_debt_id uuid, p_instalments jsonb) returns int
language plpgsql as $$
declare
  v_profile uuid;
  v_count int;
begin
  select profile_id into v_profile from debts where id = p_debt_id;
  if v_profile is null then raise exception 'Debt % not found', p_debt_id; end if;

  insert into debt_instalments (debt_id, profile_id, due_date, amount)
  select p_debt_id, v_profile, (i->>'due_date')::date, (i->>'amount')::numeric
  from jsonb_array_elements(p_instalments) i
  on conflict (debt_id, due_date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Records one confirmed payment against an instalment.
--   * Idempotent: the same p_idempotency_key always returns the first result.
--   * Locks the instalment and the debt, so two clicks can't both pay it.
--   * Refuses to pay more than is still due on the instalment.
--   * Cash paid = principal + interest/fees. Principal reduces outstanding_balance
--     and is recorded as a 'Debt Repayment' cash-out; interest/fees are a separate
--     'Interest & Fees' expense.
create or replace function record_debt_payment(
  p_instalment_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_idempotency_key text,
  p_interest numeric default 0
) returns jsonb
language plpgsql as $$
declare
  v_existing debt_payments;
  v_inst debt_instalments;
  v_debt debts;
  v_principal numeric(12,2);
  v_remaining numeric(12,2);
  v_txn uuid;
  v_interest_txn uuid;
  v_payment_id uuid;
begin
  if p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'An idempotency key is required';
  end if;

  select * into v_existing from debt_payments where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('payment_id', v_existing.id, 'duplicate', true);
  end if;

  select * into v_inst from debt_instalments where id = p_instalment_id for update;
  if not found then raise exception 'Instalment % not found', p_instalment_id; end if;
  select * into v_debt from debts where id = v_inst.debt_id for update;

  if v_inst.status in ('paid', 'cancelled') then
    raise exception 'This instalment is already %', v_inst.status;
  end if;
  if v_debt.status <> 'active' then
    raise exception 'This debt is %', replace(v_debt.status, '_', ' ');
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be more than RM0';
  end if;
  if p_paid_date is null then
    raise exception 'Payment date is required';
  end if;

  v_remaining := v_inst.amount - v_inst.amount_paid;
  if p_amount > v_remaining then
    raise exception 'Payment RM% is more than the RM% still due on this instalment', p_amount, v_remaining;
  end if;
  if coalesce(p_interest, 0) < 0 or coalesce(p_interest, 0) > p_amount then
    raise exception 'Interest and fees must be between RM0 and the payment amount';
  end if;

  v_principal := p_amount - coalesce(p_interest, 0);
  if v_principal > v_debt.outstanding_balance then
    raise exception 'Principal RM% is more than the RM% still owed', v_principal, v_debt.outstanding_balance;
  end if;

  if v_principal > 0 then
    insert into transactions (profile_id, txn_date, amount, direction, category, merchant, source, note, created_by)
    values (v_debt.profile_id, p_paid_date, v_principal, 'expense', 'Debt Repayment', v_debt.name, 'manual',
            format('Repayment for instalment due %s', v_inst.due_date), 'user')
    returning id into v_txn;
  end if;
  if coalesce(p_interest, 0) > 0 then
    insert into transactions (profile_id, txn_date, amount, direction, category, merchant, source, note, created_by)
    values (v_debt.profile_id, p_paid_date, p_interest, 'expense', 'Interest & Fees', v_debt.name, 'manual',
            format('Interest/fees for instalment due %s', v_inst.due_date), 'user')
    returning id into v_interest_txn;
  end if;

  insert into debt_payments (profile_id, debt_id, instalment_id, amount, principal_amount, interest_amount,
                             paid_date, transaction_id, interest_transaction_id, idempotency_key)
  values (v_debt.profile_id, v_debt.id, v_inst.id, p_amount, v_principal, coalesce(p_interest, 0),
          p_paid_date, v_txn, v_interest_txn, p_idempotency_key)
  returning id into v_payment_id;

  update debt_instalments
     set amount_paid = amount_paid + p_amount,
         paid_date = p_paid_date,
         status = case when amount_paid + p_amount >= amount then 'paid' else 'partial' end
   where id = v_inst.id;

  update debts
     set outstanding_balance = outstanding_balance - v_principal,
         status = case when outstanding_balance - v_principal = 0 then 'paid_off' else status end
   where id = v_debt.id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'duplicate', false,
    'principal', v_principal,
    'interest', coalesce(p_interest, 0),
    'instalment_remaining', v_remaining - p_amount,
    'outstanding_balance', v_debt.outstanding_balance - v_principal
  );
end $$;

grant all on debts, debt_instalments, debt_payments to anon, authenticated;
grant execute on function create_debt(jsonb, jsonb), add_debt_instalments(uuid, jsonb),
  record_debt_payment(uuid, numeric, date, text, numeric) to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['debts', 'debt_instalments', 'debt_payments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
