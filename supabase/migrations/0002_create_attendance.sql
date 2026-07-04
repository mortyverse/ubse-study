-- 0002_create_attendance.sql
-- Phase 1 — Attendance (PRD §4.1: real-time 4-digit code check-in)
--
-- Two tables: attendance_sessions (admin-opened check-in windows) and
-- attendance_records (per-member roster row per session).
--
-- HARD RULES enforced in the DB (not only the API):
--   * duration_minutes ∈ [1,5]              (CHECK)
--   * code is exactly 4 digits              (CHECK)
--   * default roster status is 결석/absent   (column default)
--   * the attendance CODE is NEVER readable by non-admin clients
--     (enforced by COLUMN-LEVEL grants: `code` is excluded from the grant list)
--
-- Reuses public.set_updated_at(), public.is_approved() from 0001.
--
-- WRITE MODEL (intentional): NO write policies/grants for `authenticated` on
-- either table. Every mutation — opening a session, code-verified check-in,
-- server-timed auto-close, and admin manual 지각/출석 adjustment — happens in
-- Next.js Route Handlers using the service_role key, where admin role AND
-- authoritative server time are verified (PRD §4.1 / §7). Client-side writes are
-- forbidden by design. `authenticated` gets read-only visibility.

-- ────────────────────────────────────────────────────────────────────────────
-- Enum: attendance status. UI maps present/late/absent → 출석/지각/결석.
-- ────────────────────────────────────────────────────────────────────────────
create type public.attendance_status as enum ('present', 'late', 'absent');

-- ────────────────────────────────────────────────────────────────────────────
-- Table: public.attendance_sessions  (PRD §4.1)
-- ────────────────────────────────────────────────────────────────────────────
create table public.attendance_sessions (
  id               uuid primary key default gen_random_uuid(),
  week_number      int  not null check (week_number between 1 and 10),
  code             text not null check (code ~ '^[0-9]{4}$'),   -- secret 4-digit code
  duration_minutes int  not null check (duration_minutes between 1 and 5),
  opened_at        timestamptz not null default now(),
  closes_at        timestamptz not null,
  is_active        boolean not null default true,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.attendance_sessions is
  'Admin-opened attendance windows. The `code` column is SECRET: never granted to authenticated (column-level grant excludes it); admin reads it via a service-role API route only.';
comment on column public.attendance_sessions.code is
  'Secret 4-digit check-in code. NOT exposed to authenticated via column grants, and this table is deliberately kept OUT of the Realtime publication so the code cannot leak in change payloads.';

-- Only ~one active session at a time is queried repeatedly → partial index.
create index attendance_sessions_active_idx on public.attendance_sessions (is_active) where is_active;
-- Session history listing is ordered by recency.
create index attendance_sessions_opened_at_idx on public.attendance_sessions (opened_at desc);
-- Index the created_by FK (unindexed FKs are flagged by the performance advisor).
create index attendance_sessions_created_by_idx on public.attendance_sessions (created_by);

create trigger attendance_sessions_set_updated_at
  before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Table: public.attendance_records  (PRD §4.1)
-- One roster row per (session, user). Default status = absent (결석).
-- ────────────────────────────────────────────────────────────────────────────
create table public.attendance_records (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  status     public.attendance_status not null default 'absent',
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

comment on table public.attendance_records is
  'Per-member roster status per session. Written only server-side (service role). Read-only to approved members; broadcast live via Realtime.';

-- The unique(session_id, user_id) index already covers session_id as its leading
-- column (roster fetch `where session_id = ?`), so no separate session_id index
-- is needed. user_id lookups (a member's own attendance history) need their own:
create index attendance_records_user_id_idx on public.attendance_records (user_id);

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────────────────────
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records  enable row level security;

-- SELECT (sessions): any approved member may read session metadata. The secret
-- `code` column is withheld at the GRANT layer below, not here — RLS is row-level.
create policy attendance_sessions_select_approved
  on public.attendance_sessions
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- SELECT (records): any approved member may read the full roster (PRD §4.1: the
-- roster with everyone's status is shown to all participants).
create policy attendance_records_select_approved
  on public.attendance_records
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- No INSERT/UPDATE/DELETE policies on either table: all writes go through the
-- service role in server API routes (see WRITE MODEL note at the top).

-- ────────────────────────────────────────────────────────────────────────────
-- GRANTs (required — "expose new tables" is OFF). authenticated only; no anon.
--
-- CODE SECRECY: grant SELECT on attendance_sessions COLUMN-BY-COLUMN, deliberately
-- OMITTING `code`. With column-level SELECT, any attempt by `authenticated` to
-- read `code` fails with "permission denied for column code" at the SQL layer —
-- members literally cannot select it even with a crafted query. The admin UI
-- fetches the code through a service-role API route instead.
-- ────────────────────────────────────────────────────────────────────────────
grant select
  (id, week_number, duration_minutes, opened_at, closes_at, is_active,
   created_by, created_at, updated_at)
  on public.attendance_sessions to authenticated;

-- Records are fully readable (no secret columns); read-only.
grant select on public.attendance_records to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Realtime (PRD §4.1: roster updates propagate live to all viewers)
--
-- DECISION: add ONLY attendance_records to the Realtime publication — NOT
-- attendance_sessions. Rationale: Realtime `postgres_changes` enforces row-level
-- RLS on the SELECT policy, but it does NOT honor COLUMN-LEVEL grants — change
-- payloads carry the ENTIRE row. Publishing attendance_sessions would therefore
-- broadcast the secret `code` to every subscribed member, defeating the column
-- grant above. attendance_records contains no secret, so it is safe to publish
-- and is exactly what the live roster needs. Clients obtain session metadata
-- (minus code) by refetching via the Data API / server route, where the column
-- grant applies. See PRD §4.1 "보안 규칙" (code exposed to admin role only).
-- ────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.attendance_records;
