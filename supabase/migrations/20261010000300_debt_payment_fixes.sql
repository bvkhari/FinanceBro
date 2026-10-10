-- Phase 1 fixes for record_debt_payment():
--   1. A paid-off debt cancels its remaining unpaid instalments.
--   2. Payment dates in the future (Malaysia time) are refused.
-- Also cleans up instalments already left behind on paid-off debts.

-- Records one confirmed payment against an instalment.
--   * Idempotent: the same p_idempotency_key always returns the first result.
--   * Locks the instalment and the debt, so two clicks can't both pay it.
--   * Refuses to pay more than is still due on the instalment.
--   * Refuses payment dates after today (Malaysia time): only record payments already made.
--   * When the balance reaches RM0 the debt is paid off and any instalments
--     still unpaid are cancelled, so they never show up as payments due.
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
  if p_paid_date > (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Payment date % is in the future; only record payments already made', p_paid_date;
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

  if v_debt.outstanding_balance - v_principal = 0 then
    update debt_instalments
       set status = 'cancelled'
     where debt_id = v_debt.id and status in ('scheduled', 'partial');
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'duplicate', false,
    'principal', v_principal,
    'interest', coalesce(p_interest, 0),
    'instalment_remaining', v_remaining - p_amount,
    'outstanding_balance', v_debt.outstanding_balance - v_principal
  );
end $$;

update debt_instalments i
   set status = 'cancelled'
  from debts d
 where d.id = i.debt_id and d.status = 'paid_off' and i.status in ('scheduled', 'partial');
