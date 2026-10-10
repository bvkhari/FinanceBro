-- Cash vs expense (phase 3).
-- A purchase made on credit (BNPL, supplier invoice) is an expense when it is
-- bought, but cash only moves when the debt is repaid. So:
--   transactions.cash_effect = false  -> counts as an expense, never touches the balance
--   'Debt Repayment' transactions     -> move cash, but are not an expense (the app excludes them)
-- debts.purchase_transaction_id links a debt to the purchase it paid for.

alter table transactions add column if not exists cash_effect boolean not null default true;
alter table debts add column if not exists purchase_transaction_id uuid references transactions(id) on delete set null;

-- Balance trigger: only transactions with a cash effect move current_balance.
create or replace function apply_txn_to_balance() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.cash_effect then
    update profiles
       set current_balance = current_balance - case old.direction when 'income' then old.amount else -old.amount end
     where id = old.profile_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.cash_effect then
    update profiles
       set current_balance = current_balance + case new.direction when 'income' then new.amount else -new.amount end
     where id = new.profile_id;
  end if;
  return null;
end $$;

drop trigger if exists transactions_balance on transactions;
create trigger transactions_balance
  after insert or update of amount, direction, profile_id, cash_effect or delete on transactions
  for each row execute function apply_txn_to_balance();

-- Creates a debt and its schedule in one transaction.
-- p_debt: debt columns as JSON (id optional). p_instalments: [{due_date, amount}].
-- Optional p_debt.purchase = {txn_date, category, note}: also records what was
-- bought on credit as an expense of original_amount with no cash effect, linked
-- to the debt. The expense counts once, when bought; cash moves only when repaid.
create or replace function create_debt(p_debt jsonb, p_instalments jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid := coalesce((p_debt->>'id')::uuid, gen_random_uuid());
  v_profile uuid := (p_debt->>'profile_id')::uuid;
  v_purchase jsonb := p_debt->'purchase';
  v_purchase_txn uuid;
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

  if v_purchase is not null and jsonb_typeof(v_purchase) = 'object' then
    if coalesce(v_purchase->>'txn_date', '') = '' or coalesce(v_purchase->>'category', '') = '' then
      raise exception 'A purchase needs a date and a category';
    end if;
    insert into transactions (profile_id, txn_date, amount, direction, category, merchant, source, note, created_by, cash_effect)
    values (v_profile, (v_purchase->>'txn_date')::date, (p_debt->>'original_amount')::numeric, 'expense',
            v_purchase->>'category', p_debt->>'name', 'manual',
            coalesce(nullif(v_purchase->>'note', ''), 'Bought on credit'), 'user', false)
    returning id into v_purchase_txn;
    update debts set purchase_transaction_id = v_purchase_txn where id = v_id;
  end if;

  return v_id;
end $$;

