-- Keep profiles.current_balance in step with the ledger, so every writer
-- (web app, MCP tools, seed) changes the balance the same way.

create or replace function apply_txn_to_balance() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update profiles
       set current_balance = current_balance - case old.direction when 'income' then old.amount else -old.amount end
     where id = old.profile_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update profiles
       set current_balance = current_balance + case new.direction when 'income' then new.amount else -new.amount end
     where id = new.profile_id;
  end if;
  return null;
end $$;

drop trigger if exists transactions_balance on transactions;
create trigger transactions_balance
  after insert or update of amount, direction, profile_id or delete on transactions
  for each row execute function apply_txn_to_balance();
