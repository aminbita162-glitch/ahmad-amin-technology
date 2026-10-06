-- Phase 4 — Data Seal
-- Ahmad & Amin Technology 2026
--
-- This script is NOT applied by the worker. A human must run it
-- against the live Supabase project before Phase 5 can go live.
-- The seal (execution/phase-4-seal.txt) is BLOCKED until that happens.
--
-- Two people, no third account. Handles are lowercase only.

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.profiles (
  handle text not null primary key
    check (handle in ('amin', 'ahmad')),
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender text not null
    check (sender in ('amin', 'ahmad')),
  body text not null
    check (char_length(body) >= 1 and char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx
  on public.messages (created_at);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.messages enable row level security;

-- Revoke default access so RLS is the only gate.
revoke all on public.profiles from anon, authenticated;
revoke all on public.messages from anon, authenticated;

-- Profiles: authenticated users may read every profile (both brothers).
create policy "profiles_auth_select"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Messages: authenticated users may read all messages.
create policy "messages_auth_select"
  on public.messages
  for select
  to authenticated
  using (true);

-- Messages: a row may be inserted only when sender equals the caller's
-- handle. The caller handle is stored in profiles.handle, so the JWT
-- claim sub must map to a profile whose handle matches the row.
create policy "messages_insert_own_handle"
  on public.messages
  for insert
  to authenticated
  with check (
    sender in ('amin', 'ahmad')
    and sender = (
      select p.handle
      from public.profiles p
      where p.handle = (
        auth.jwt() ->> 'user_metadata' ->> 'handle'
      )
    )
  );

-- ============================================================================
-- Realtime
-- ============================================================================

-- Add the messages table to the realtime publication so insert events
-- are pushed to subscribed clients.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

-- ============================================================================
-- End of script. Do not apply from the worker.
-- ============================================================================
