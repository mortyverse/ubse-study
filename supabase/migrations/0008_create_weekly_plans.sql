-- 0008_create_weekly_plans.sql
-- Phase 3 — Weekly plan table (PRD §4.3 주차별 계획)
--
-- The 10-week curriculum table shown read-only on the main dashboard (4.7/4.3).
-- The admin toggles each week's completion via a checkbox on the main page →
-- progress rate auto-calculates. Members see it read-only with a progress bar.
--
-- Reuses public.set_updated_at() and public.is_approved() from 0001.
--
-- WRITE MODEL (mirrors 0002/0005): approved members get SELECT only. There is NO
-- write policy or write grant for `authenticated`. The admin's completion toggle
-- goes through a service-role API route (service_role bypasses RLS but still
-- needs the explicit table grant — see 0004), keeping is_completed unwritable by
-- ordinary members at the Data API layer.

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.weekly_plans  (PRD §4.3)
--   Base columns from the PRD block: week_number, section_number, lecture_range,
--   title, is_completed. resource_url added per PRD §4.3 (the Inflearn course
--   link — one link for the whole 10-week run). created_at/updated_at are
--   housekeeping.
-- ════════════════════════════════════════════════════════════════════════════
create table public.weekly_plans (
  id             uuid primary key default gen_random_uuid(),
  week_number    int  not null unique check (week_number between 1 and 10),
  section_number int  not null,
  lecture_range  text not null,
  title          text not null,
  is_completed   boolean not null default false,
  resource_url   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.weekly_plans is
  'PRD §4.3 주차별 계획 — 10-week curriculum. Read-only to approved members; admin toggles is_completed via service-role API route (no member write path).';
comment on column public.weekly_plans.week_number is
  'Curriculum week 1–10 (unique). Drives ordering and progress-rate calc on the main dashboard.';
comment on column public.weekly_plans.section_number is
  'Section N from the course curriculum (PRD §4.3 table). Weeks can share a section.';
comment on column public.weekly_plans.lecture_range is
  'Lecture range for the week (e.g. "1강 ~ 6강"), verbatim from PRD §4.3.';
comment on column public.weekly_plans.title is
  'Summarized week title, verbatim from PRD §4.3 table (Korean).';
comment on column public.weekly_plans.is_completed is
  'Admin-only completion toggle; feeds the auto-calculated progress rate.';
comment on column public.weekly_plans.resource_url is
  'PRD §4.3 resource_url — the Inflearn course link (one link for all 10 weeks).';

create trigger weekly_plans_set_updated_at
  before update on public.weekly_plans
  for each row execute function public.set_updated_at();

-- Index the completion flag: the main dashboard filters/aggregates on it to
-- compute the progress rate. week_number already has a unique index.
create index weekly_plans_is_completed_idx on public.weekly_plans (is_completed);

-- ── RLS: approved members read; no write policy (admin writes via service role) ─
alter table public.weekly_plans enable row level security;

-- SELECT: any approved member may read the full weekly plan (it is shown to the
-- whole roster on the main dashboard). Non-approved / pending users are blocked.
create policy weekly_plans_select_approved
  on public.weekly_plans
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- No INSERT/UPDATE/DELETE policy for authenticated — the admin's completion
-- toggle and any seed edits run through the service-role API route only.

-- GRANTs (expose OFF): read-only to authenticated; full DML to service_role.
grant select on public.weekly_plans to authenticated;
grant select, insert, update, delete on public.weekly_plans to service_role;

-- Hygiene: no anon access.
revoke all on public.weekly_plans from anon;

-- ════════════════════════════════════════════════════════════════════════════
-- Seed: the exact 10-week curriculum from the PRD §4.3 table.
--   section_number = the N from "Section N". lecture_range / title verbatim.
--   Every row uses the single Inflearn course link (PRD §4.3 resource_url).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.weekly_plans (week_number, section_number, lecture_range, title, resource_url)
values
  (1,  1, '1강 ~ 6강',   '사용자에서 설계자로 — Claude Code를 왜 지금 써야 하는가', 'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (2,  2, '7강 ~ 14강',  '핵심 엔진 정복 — Claude Code 기본기와 비용 전략',          'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (3,  3, '15강 ~ 17강', '미니 프로젝트 — 실전 앱을 직접 만들어보기',               'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (4,  4, '18강 ~ 20강', '자동화 레이어 (전반) — AI를 팀원으로 만들기',             'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (5,  4, '21강 ~ 24강', '자동화 레이어 (후반) — AI를 팀원으로 만들기',             'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (6,  5, '25강 ~ 27강', '오케스트레이터로의 전환 (1부)',                          'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (7,  5, '28강 ~ 32강', '오케스트레이터로의 전환 (2부)',                          'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (8,  5, '33강 ~ 35강', '오케스트레이터로의 전환 (3부)',                          'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (9,  5, '36강',        '오케스트레이터로의 전환 (4부)',                          'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819'),
  (10, 5, '37강 ~ 39강', '오케스트레이터로의 전환 (마무리)',                        'https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819');
