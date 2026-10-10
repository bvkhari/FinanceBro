-- Editing a schedule without touching payment history (phase 3, step 10).
-- Paid and cancelled instalments are locked. An instalment with payments can
-- change its amount (never below what is already paid) but can't be cancelled.

-- Changes the due date and/or amount of one instalment that isn't settled.
create or replace function update_debt_instalment(p_instalment_id uuid, p_due_date date, p_amount numeric)
returns void
language plpgsql as $$
declare
  v_inst debt_instalments;
  v_debt debts;
begin
  select * into v_inst from debt_instalments where id = p_instalment_id for update;
  if not found then raise exception 'Instalment % not found', p_instalment_id; end if;
  select * into v_debt from debts where id = v_inst.debt_id for update;

  if v_inst.status in ('paid', 'cancelled') then
    raise exception 'A % instalment can''t be changed', v_inst.status;
  end if;
  if v_debt.status <> 'active' then
    raise exception 'This debt is %', replace(v_debt.status, '_', ' ');
  end if;
  if p_due_date is null then raise exception 'Due date is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than RM0'; end if;
  if p_amount < v_inst.amount_paid then
    raise exception 'Amount can''t be less than the RM% already paid on this instalment', v_inst.amount_paid;
  end if;
  if exists (select 1 from debt_instalments where debt_id = v_inst.debt_id and due_date = p_due_date and id <> v_inst.id) then
    raise exception 'Another instalment is already due on %', p_due_date;
  end if;

  update debt_instalments
     set due_date = p_due_date,
         amount = p_amount,
         -- Lowering a partly paid instalment to what was paid settles it.
         status = case when amount_paid > 0 and amount_paid >= p_amount then 'paid' else status end
   where id = v_inst.id;
end $$;

-- Cancels one instalment that has no payments. It stays in the schedule as history.
create or replace function cancel_debt_instalment(p_instalment_id uuid)
returns void
language plpgsql as $$
declare
  v_inst debt_instalments;
begin
  select * into v_inst from debt_instalments where id = p_instalment_id for update;
  if not found then raise exception 'Instalment % not found', p_instalment_id; end if;
  if v_inst.status = 'cancelled' then raise exception 'This instalment is already cancelled'; end if;
  if v_inst.status = 'paid' then raise exception 'A paid instalment can''t be cancelled'; end if;
  if v_inst.amount_paid > 0 then
    raise exception 'This instalment already has RM% paid, so it can''t be cancelled. Change its amount instead.', v_inst.amount_paid;
  end if;
  update debt_instalments set status = 'cancelled' where id = v_inst.id;
end $$;

-- Replaces every instalment with no payments (upcoming or overdue) by a new
-- schedule, and records the new frequency and repayment amount. Paid, partly
-- paid and cancelled instalments are kept exactly as they are. All or nothing.
-- Returns how many instalments were created.
create or replace function reschedule_debt(
  p_debt_id uuid,
  p_frequency text,
  p_repayment_amount numeric,
  p_instalments jsonb
) returns int
language plpgsql as $$
declare
  v_debt debts;
  v_clash date;
  v_count int;
begin
  select * into v_debt from debts where id = p_debt_id for update;
  if not found then raise exception 'Debt % not found', p_debt_id; end if;
  if v_debt.status <> 'active' then
    raise exception 'This debt is %', replace(v_debt.status, '_', ' ');
  end if;
  if jsonb_array_length(coalesce(p_instalments, '[]')) = 0 then
    raise exception 'The new schedule needs at least one instalment';
  end if;

  delete from debt_instalments
   where debt_id = p_debt_id and status = 'scheduled' and amount_paid = 0;

  select (i->>'due_date')::date into v_clash
    from jsonb_array_elements(p_instalments) i
   where exists (select 1 from debt_instalments d where d.debt_id = p_debt_id and d.due_date = (i->>'due_date')::date)
   limit 1;
  if v_clash is not null then
    raise exception 'An instalment you have already paid or cancelled is due on %; pick a different first date', v_clash;
  end if;

  insert into debt_instalments (debt_id, profile_id, due_date, amount)
  select p_debt_id, v_debt.profile_id, (i->>'due_date')::date, (i->>'amount')::numeric
  from jsonb_array_elements(p_instalments) i;
  get diagnostics v_count = row_count;

  update debts
     set frequency = p_frequency,
         repayment_amount = case when p_frequency in ('one_time', 'irregular') then null else p_repayment_amount end
   where id = p_debt_id;

  return v_count;
end $$;

grant execute on function update_debt_instalment(uuid, date, numeric), cancel_debt_instalment(uuid),
  reschedule_debt(uuid, text, numeric, jsonb) to anon, authenticated;
