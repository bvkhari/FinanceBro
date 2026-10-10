-- Every tool call an outside agent (WorkBuddy, over MCP) makes, so the app can show what the agent did.
create table if not exists agent_activity (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tool text not null,
  input jsonb not null default '{}',
  ok boolean not null,
  summary text not null,
  is_write boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists agent_activity_profile_idx on agent_activity (profile_id, created_at desc);

grant all on agent_activity to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'agent_activity'
  ) then
    alter publication supabase_realtime add table agent_activity;
  end if;
end $$;
