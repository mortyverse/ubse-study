-- 0001_create_users.sql
-- Phase 1 — Auth / Approval Gate (PRD §4.0)
--
-- Creates the public.users profile table (1:1 with auth.users), the single-admin
-- invariant, auto-provisioning trigger, RLS helper functions, RLS policies, and
-- the explicit GRANTs required because the dev/prod projects have
-- "Automatically expose new tables" = OFF (a table is invisible to the Data API
-- until table privileges are granted to the API role — here, `authenticated` only;
-- this app has NO anonymous access, so nothing is granted to `anon`).
--
-- RLS gates which ROWS are visible; GRANT gates whether the API can see the table
-- at all. Both are required.

-- ────────────────────────────────────────────────────────────────────────────
-- Enum types
-- ────────────────────────────────────────────────────────────────────────────
create type public.user_role   as enum ('admin', 'member');
create type public.user_status as enum ('pending', 'approved', 'rejected');

-- ────────────────────────────────────────────────────────────────────────────
-- Shared trigger function: keep updated_at fresh on every UPDATE.
-- SECURITY INVOKER (default) — it only touches the NEW row of the current write.
-- search_path pinned to '' so unqualified names cannot be hijacked.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Table: public.users  (PRD §4.0)
-- id mirrors auth.users(id); profile is auto-provisioned on first OAuth login.
-- ────────────────────────────────────────────────────────────────────────────
create table public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  github_id       text unique,                                  -- GitHub provider_id
  github_username text,                                         -- GitHub user_name
  display_name    text not null,
  avatar_url      text,
  role            public.user_role   not null default 'member',
  status          public.user_status not null default 'pending',
  approved_by     uuid references public.users (id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.users is
  'Study-member profiles (1:1 with auth.users). Approval gate: status defaults to pending; admin flips to approved/rejected.';

-- Single-admin invariant (PRD §3: exactly one admin ever exists).
create unique index users_single_admin_idx on public.users (role) where role = 'admin';

-- Admin "pending list" filters on status.
create index users_status_idx on public.users (status);

-- Index the approved_by FK (unindexed FKs are flagged by the performance advisor).
create index users_approved_by_idx on public.users (approved_by);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Auto-provision trigger: create a public.users row on first auth signup.
-- SECURITY DEFINER because the row is inserted before any session/RLS context
-- exists. Only profile fields come from raw_user_meta_data; role/status use the
-- safe table defaults (member / pending) — user-editable metadata is NEVER used
-- for authorization here.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, github_id, github_username, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'provider_id',
    new.raw_user_meta_data ->> 'user_name',
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'user_name',
      new.email
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- handle_new_user is only ever invoked by the trigger below (trigger execution
-- does not check EXECUTE privilege); revoke direct callability from everyone.
revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- RLS helper functions.
-- SECURITY DEFINER + STABLE so that RLS policies on public.users can call them
-- WITHOUT triggering recursive RLS evaluation on public.users itself. They only
-- return a boolean ABOUT THE CALLER (auth.uid()); they expose no row data, so
-- the definer privilege leaks nothing. search_path pinned to ''.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and role = 'admin'
      and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and status = 'approved'
  );
$$;

-- These SECURITY DEFINER functions live in the exposed `public` schema, so lock
-- down who can call them: revoke the default PUBLIC grant, allow authenticated only.
revoke all on function public.is_admin()    from public;
revoke all on function public.is_approved() from public;
grant execute on function public.is_admin()    to authenticated;
grant execute on function public.is_approved() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

-- SELECT: a user can always read their own profile row (needed by pending users
-- for the "승인 대기 중" screen, and by everyone for their own data).
create policy users_select_own
  on public.users
  for select
  to authenticated
  using ( id = (select auth.uid()) );

-- SELECT: approved members can read other APPROVED members' rows. The roster and
-- the public real-name ranking (PRD §4.1/§4.4) require this; pending/rejected
-- accounts stay hidden from peers.
create policy users_select_approved_peers
  on public.users
  for select
  to authenticated
  using ( (select public.is_approved()) and status = 'approved' );

-- SELECT: the admin can read every row (approval queue includes pending/rejected).
create policy users_select_admin_all
  on public.users
  for select
  to authenticated
  using ( (select public.is_admin()) );

-- UPDATE: admin only — this is the approve/reject flow (status, approved_by,
-- approved_at). Members get NO update policy in Phase 1 (profile links arrive in
-- Phase 2). Both USING and WITH CHECK gate the admin so a non-admin can neither
-- see nor rewrite rows through this policy.
create policy users_update_admin
  on public.users
  for update
  to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- No INSERT policy: provisioning happens only via the SECURITY DEFINER trigger.
-- No DELETE policy: account deletion is out of scope for this phase.

-- ────────────────────────────────────────────────────────────────────────────
-- GRANTs (required — "expose new tables" is OFF). authenticated only; no anon.
-- SELECT + UPDATE only; INSERT/DELETE are intentionally withheld (see above).
-- RLS still restricts which rows these privileges actually reach.
-- ────────────────────────────────────────────────────────────────────────────
grant select, update on public.users to authenticated;
