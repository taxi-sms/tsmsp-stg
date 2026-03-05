-- Step 1: app_state table for cloud backup/restore (idempotent)
-- Run this in Supabase SQL Editor before using cloud-store.js features.

begin;

create extension if not exists pgcrypto;

create table if not exists public.app_state (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_state_pk primary key (user_id, key)
);

create index if not exists idx_app_state_user_updated
  on public.app_state(user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
before update on public.app_state
for each row execute function public.set_updated_at();

alter table public.app_state enable row level security;

drop policy if exists "app_state_select_own" on public.app_state;
create policy "app_state_select_own"
on public.app_state
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "app_state_insert_own" on public.app_state;
create policy "app_state_insert_own"
on public.app_state
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "app_state_update_own" on public.app_state;
create policy "app_state_update_own"
on public.app_state
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "app_state_delete_own" on public.app_state;
create policy "app_state_delete_own"
on public.app_state
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.app_state to authenticated;
revoke all on public.app_state from anon;

comment on table public.app_state
  is 'Per-user key/value JSON storage for cloud backup and restore.';

commit;
