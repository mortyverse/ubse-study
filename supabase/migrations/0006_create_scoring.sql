-- 0006_create_scoring.sql
-- Phase 2 — Scoring / ranking config + profile links (PRD §4.4 마이페이지)
--
-- Two changes:
--   1. public.app_settings — key/value config store; seeds the 'scoring' row that
--      holds the admin-configurable attendance weight for total-score calculation.
--   2. public.users        — add github_url / project_url (PRD §4.4: GitHub &
--      personal-project links registered/exposed on 마이페이지). Implemented as a
--      users extension per the PRD ("users 확장 방식"), NOT a separate table.
--
-- Reuses public.set_updated_at(), public.is_approved() from 0001.
--
-- WRITE MODEL (mirrors 0002/0005): no write policies/grants for `authenticated`.
--   * app_settings: only the admin edits the scoring weight, via a service-role
--     API route. Read-only to approved members (the mypage needs the weight to
--     display/derive totals).
--   * users.github_url / project_url: members update ONLY these two fields via a
--     fixed-payload service-role API route (the route whitelists exactly these
--     columns and targets the caller's own row). See the note on the ALTER below.

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.app_settings  (PRD §4.4 — admin-configurable scoring weight)
--
-- Total score model (PRD §4.4):
--   총점 = Σ(시험 최종 점수)  +  출석률(0–1) × attendance_weight
-- attendance_weight is admin-tunable; stored as JSONB so future scoring knobs can
-- be added without a schema migration.
-- ════════════════════════════════════════════════════════════════════════════
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

comment on table public.app_settings is
  'Key/value app config (JSONB). Read-only to approved members; admin edits via service-role API. Seeds the scoring weight.';
comment on column public.app_settings.value is
  'scoring row: {"attendance_weight": N} — 총점 = Σ(exam final scores) + 출석률(0–1) × attendance_weight. Admin-configurable (PRD §4.4).';

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Seed the scoring config. Default attendance_weight = 100 (attendance rate 0–1
-- scaled to a 0–100 contribution). Admin adjusts via the admin scoring settings.
insert into public.app_settings (key, value, description)
values (
  'scoring',
  '{"attendance_weight": 100}'::jsonb,
  '총점 = 시험 최종 점수 합 + 출석률(0–1) × attendance_weight. 관리자 조정 가능.'
);

-- ── RLS: approved members read; no write policy (admin writes via service role) ─
alter table public.app_settings enable row level security;

create policy app_settings_select_approved
  on public.app_settings
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- GRANTs (expose OFF): read-only to authenticated; full DML to service_role.
grant select on public.app_settings to authenticated;
grant select, insert, update, delete on public.app_settings to service_role;

-- Hygiene: no anon access.
revoke all on public.app_settings from anon;

-- ════════════════════════════════════════════════════════════════════════════
-- Extend public.users with profile links  (PRD §4.4 — GitHub / 프로젝트 링크)
--
-- Added as columns on the existing users table ("users 확장 방식", PRD §4.4),
-- not a separate table.
--
-- NO new RLS policy is needed for members to set these, BY DESIGN:
--   * `authenticated` has NO self-UPDATE policy on public.users (0001 grants
--     members read-only + admin-only UPDATE). Members therefore CANNOT update
--     these columns directly through the Data API — a member's "edit my links"
--     action goes through a service-role API route that whitelists EXACTLY
--     {github_url, project_url} on the caller's own row (fixed payload; no other
--     column is writable). This keeps role/status/score fields untouchable by
--     members while still letting them self-manage their two links.
--   * The admin UPDATE policy from 0001 (users_update_admin) already covers any
--     admin edit of these columns — no change required.
--   * The existing 0001 SELECT policies already expose these columns for the
--     public real-name ranking / profile display (PRD §4.4), and the existing
--     `grant select, update on public.users to authenticated` (0001) plus the
--     service_role grant (0004) already cover the new columns (column-list grants
--     were not used on users, so new columns inherit table-level SELECT/UPDATE).
-- ════════════════════════════════════════════════════════════════════════════
alter table public.users
  add column github_url  text,
  add column project_url text;

comment on column public.users.github_url is
  'PRD §4.4: member GitHub link, public on 마이페이지/ranking. Self-set via fixed-payload service-role route only.';
comment on column public.users.project_url is
  'PRD §4.4: member personal-project link (repo or deploy URL), public. Self-set via fixed-payload service-role route only.';
