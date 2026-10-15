-- FinanceBro tracks PayLater (BNPL) plans for student profiles only.
-- Removes the business profile, bills, budgets, the unused tables and the non-BNPL debt types.
--
-- `npm run db:migrate` re-runs every migration, and the earlier ones re-create some of
-- these objects (empty tables, the debt-type trigger), so every step here is safe to repeat.

begin;

-- Business profiles and everything under them (debts, instalments, payments, transactions,
-- bills, budgets, expected income, agent activity all cascade on profile delete).
delete from profiles where mode <> 'student';

-- Only BNPL debts are tracked. Delete any other type on a student profile first.
delete from debts where debt_type <> 'bnpl';

-- Bills and budgets. reminders references commitments, so it goes first.
drop table if exists reminders;
drop table if exists commitments;
drop table if exists budgets;

-- Never used by the app.
drop table if exists reports;
drop table if exists agent_runs;

-- Personal vs business debt types no longer apply.
drop trigger if exists debts_type_matches_profile on debts;
drop function if exists check_debt_type_matches_profile();

-- Tighten what new rows can contain.
alter table profiles drop constraint if exists profiles_mode_check;
alter table profiles add constraint profiles_mode_check check (mode = 'student');

alter table debts drop constraint if exists debts_debt_type_check;
alter table debts add constraint debts_debt_type_check check (debt_type = 'bnpl');

delete from income_schedule where source = 'sales';
alter table income_schedule drop constraint if exists income_schedule_source_check;
alter table income_schedule add constraint income_schedule_source_check
  check (source in ('allowance', 'salary', 'PTPTN', 'other'));

commit;
