-- Phase 4 + R7 — Data Seal
-- Ahmad & Amin Technology 2026
--
-- This script is NOT applied by the worker. A human must run it
-- against the live Supabase project before sync can go live.
-- The seal is BLOCKED until that happens.
--
-- Three tables: profiles, chats, and messages.
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

create table if not exists public.chats (
  id bigint generated always as identity primary key,
  handle text not null
    check (handle in ('amin', 'ahmad')),
  name text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  chat_id bigint references public.chats(id) on delete cascade,
  sender text not null
    check (sender in ('amin', 'ahmad')),
  body text not null
    check (char_length(body) >= 1 and char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx
  on public.messages (created_at);

create index if not exists messages_chat_id_idx
  on public.messages (chat_id);

create index if not exists chats_handle_idx
  on public.chats (handle);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

-- Revoke default access so RLS is the only gate.
revoke all on public.profiles from anon, authenticated;
revoke all on public.chats from anon, authenticated;
revoke all on public.messages from anon, authenticated;

-- Profiles: authenticated users may read every profile (both brothers).
create policy "profiles_auth_select"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Chats: authenticated users may read all chats.
create policy "chats_auth_select"
  on public.chats
  for select
  to authenticated
  using (true);

-- Chats: a row may be inserted only when handle equals the caller's handle.
create policy "chats_insert_own_handle"
  on public.chats
  for insert
  to authenticated
  with check (
    handle in ('amin', 'ahmad')
    and handle = (
      select p.handle
      from public.profiles p
      where p.handle = (
        auth.jwt() -> 'user_metadata' ->> 'handle'
      )
    )
  );

-- Chats: a row may be updated only when handle equals the caller's handle.
create policy "chats_update_own_handle"
  on public.chats
  for update
  to authenticated
  using (
    handle = (
      select p.handle
      from public.profiles p
      where p.handle = (
        auth.jwt() -> 'user_metadata' ->> 'handle'
      )
    )
  );

-- Chats: a row may be deleted only when handle equals the caller's handle.
create policy "chats_delete_own_handle"
  on public.chats
  for delete
  to authenticated
  using (
    handle = (
      select p.handle
      from public.profiles p
      where p.handle = (
        auth.jwt() -> 'user_metadata' ->> 'handle'
      )
    )
  );

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
        auth.jwt() -> 'user_metadata' ->> 'handle'
      )
    )
  );

-- Grant table-level privileges to the authenticated role AFTER the
-- policies are in place. RLS filters rows, but the role still needs
-- SELECT / INSERT / UPDATE / DELETE on the table for the policies
-- to execute at all.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.chats to authenticated;
grant select, insert on public.messages to authenticated;

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

-- Add the chats table to the realtime publication so chat events are
-- pushed to subscribed clients.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
end
$$;

-- ============================================================================
-- End of script. Do not apply from the worker.
-- ============================================================================
