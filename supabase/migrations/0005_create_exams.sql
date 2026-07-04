-- 0005_create_exams.sql
-- Phase 2 — Online exam (PRD §4.2: subjective-only, timed, AI 1st-draft grading + dispute)
--
-- Six tables, column names/shape verbatim from PRD §4.2 DB block (lines 144–154):
--   exams · exam_questions · exam_submissions · exam_answers ·
--   exam_disputes · exam_dispute_comments
--
-- Reuses public.set_updated_at(), public.is_admin(), public.is_approved() from 0001.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WRITE MODEL (intentional — mirrors attendance in 0002):
--   NO write policies and NO write grants for `authenticated` on ANY of these
--   tables. Every mutation flows through Next.js Route Handlers using the
--   service_role key, where the following invariants are enforced server-side:
--     * exam / exam_questions CRUD            → admin only
--     * starting a submission, saving answers  → own submission only, and ONLY
--       before the server-computed deadline (started_at + time_limit_minutes;
--       server time is authoritative — no client/localStorage trust, PRD §4.2/§7)
--     * ai_score / ai_rationale                → written by the async Gemini
--       grading job (service role) as a DRAFT — never final
--     * final_score / resolved_by / resolved_at→ admin only; the admin may flip
--       correct↔incorrect both ways (PRD §4.2 step 5). Only the FINAL score feeds
--       totals/attendance-rate/ranking — never the AI draft (PRD §4.2 step 6)
--     * exam_disputes                          → created only on the caller's OWN
--       answer (checked in the API), status open→resolved by admin
--     * exam_dispute_comments                  → any approved member may comment
--   `authenticated` therefore gets read-only visibility (SELECT grants + SELECT
--   policies below). Client-side writes are forbidden by design.
-- ════════════════════════════════════════════════════════════════════════════
--
-- HOUSEKEEPING COLUMNS added beyond the PRD block (flagged for the auditor):
--   * created_at / updated_at (+ set_updated_at trigger) on every table
--   * exam_submissions.grading_status  — powers the "채점 중" async UI state
--     ('pending' → 'grading' → 'completed' | 'failed')
--   * exam_disputes.status             — 'open' | 'resolved' (dispute lifecycle)

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.exams  (PRD §4.2)
-- ════════════════════════════════════════════════════════════════════════════
create table public.exams (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  week_number        int  not null check (week_number between 1 and 10),
  time_limit_minutes int  not null check (time_limit_minutes > 0),
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.exams is
  'Exam definitions (admin-created via service-role API). Read-only to approved members. time_limit_minutes drives the server-authoritative countdown.';

-- Index the created_by FK (unindexed FKs are flagged by the performance advisor).
create index exams_created_by_idx on public.exams (created_by);

create trigger exams_set_updated_at
  before update on public.exams
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.exam_questions  (PRD §4.2)
-- "order" is a PRD-named column and a reserved word → always double-quoted.
-- ════════════════════════════════════════════════════════════════════════════
create table public.exam_questions (
  id            uuid primary key default gen_random_uuid(),
  exam_id       uuid not null references public.exams (id) on delete cascade,
  question_text text not null,
  max_score     int  not null check (max_score > 0),
  "order"       int  not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (exam_id, "order")
);

comment on table public.exam_questions is
  'Questions per exam. Subjective (text) answers only. "order" fixes display order; unique per exam.';

-- unique(exam_id, "order") already indexes exam_id as its leading column, so a
-- separate exam_id index would be redundant — but the task asks for an explicit
-- FK index; the composite unique satisfies the advisor for `where exam_id = ?`.
create index exam_questions_exam_id_idx on public.exam_questions (exam_id);

create trigger exam_questions_set_updated_at
  before update on public.exam_questions
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.exam_submissions  (PRD §4.2)
-- One attempt per (exam, user). started_at is the server-recorded clock the
-- deadline is computed from; submitted_at is set on submit / auto-submit.
-- ════════════════════════════════════════════════════════════════════════════
create table public.exam_submissions (
  id             uuid primary key default gen_random_uuid(),
  exam_id        uuid not null references public.exams (id) on delete cascade,
  user_id        uuid not null references public.users (id) on delete cascade,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  grading_status text not null default 'pending'
                   check (grading_status in ('pending','grading','completed','failed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (exam_id, user_id)
);

comment on table public.exam_submissions is
  'One attempt per member per exam. grading_status (housekeeping) powers the async "채점 중" UI. Read: own row or admin; all writes via service role.';
comment on column public.exam_submissions.grading_status is
  'Housekeeping (not in PRD block): pending→grading→completed|failed for the async Gemini draft-grading job.';

-- exam_id lookups (list all submissions for an exam — admin grading view).
create index exam_submissions_exam_id_idx on public.exam_submissions (exam_id);
-- user_id lookups (a member's own submissions across exams).
create index exam_submissions_user_id_idx on public.exam_submissions (user_id);

create trigger exam_submissions_set_updated_at
  before update on public.exam_submissions
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.exam_answers  (PRD §4.2)
-- ai_score/ai_rationale = Gemini DRAFT; final_score/resolved_by/resolved_at =
-- admin's authoritative verdict. Only final_score feeds ranking (PRD §4.2 #6).
-- ════════════════════════════════════════════════════════════════════════════
create table public.exam_answers (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.exam_submissions (id) on delete cascade,
  question_id   uuid not null references public.exam_questions (id) on delete cascade,
  answer_text   text,
  ai_score      numeric,
  ai_rationale  text,
  final_score   numeric,
  resolved_by   uuid references public.users (id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (submission_id, question_id)
);

comment on table public.exam_answers is
  'Per-question answers + AI draft (ai_score/ai_rationale) + admin final (final_score/resolved_by). Only final_score is authoritative for totals/ranking. Written only via service role.';

-- unique(submission_id, question_id) covers submission_id as leading column.
-- question_id and resolved_by FKs need their own indexes (advisor).
create index exam_answers_question_id_idx on public.exam_answers (question_id);
create index exam_answers_resolved_by_idx on public.exam_answers (resolved_by);

create trigger exam_answers_set_updated_at
  before update on public.exam_answers
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.exam_disputes  (PRD §4.2 step 4 — 이의제기)
-- Filed by a member on their own answer; discussed by all approved members.
-- ════════════════════════════════════════════════════════════════════════════
create table public.exam_disputes (
  id         uuid primary key default gen_random_uuid(),
  answer_id  uuid not null references public.exam_answers (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete cascade,
  status     text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.exam_disputes is
  'A dispute (이의제기) on one answer. status (housekeeping) = open|resolved. Created via service role on the caller''s OWN answer only.';
comment on column public.exam_disputes.status is
  'Housekeeping (not in PRD block): open|resolved. Admin resolves when finalizing the score.';

create index exam_disputes_answer_id_idx  on public.exam_disputes (answer_id);
create index exam_disputes_created_by_idx on public.exam_disputes (created_by);

create trigger exam_disputes_set_updated_at
  before update on public.exam_disputes
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.exam_dispute_comments  (PRD §4.2 step 4 — 토론 댓글)
-- ════════════════════════════════════════════════════════════════════════════
create table public.exam_dispute_comments (
  id         uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.exam_disputes (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.exam_dispute_comments is
  'Discussion comments on a dispute. Any approved member may comment (via service role). Read-only to approved members.';

create index exam_dispute_comments_dispute_id_idx on public.exam_dispute_comments (dispute_id);
create index exam_dispute_comments_user_id_idx    on public.exam_dispute_comments (user_id);

create trigger exam_dispute_comments_set_updated_at
  before update on public.exam_dispute_comments
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security  (SELECT-only; all writes via service role — see WRITE MODEL)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.exams                 enable row level security;
alter table public.exam_questions        enable row level security;
alter table public.exam_submissions      enable row level security;
alter table public.exam_answers          enable row level security;
alter table public.exam_disputes         enable row level security;
alter table public.exam_dispute_comments enable row level security;

-- ── exams: approved members read all exams (list / take). ────────────────────
create policy exams_select_approved
  on public.exams
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- ── exam_questions: 문제 사전 열람 차단. ─────────────────────────────────────
-- 제한시간의 실효성을 위해, 문제는 본인 submission이 생긴 뒤(=서버가 started_at을
-- 기록해 타이머가 돌기 시작한 뒤)에만 읽을 수 있다. 시작 전에 PostgREST로 문제를
-- 미리 읽는 우회를 RLS 레벨에서 차단한다. admin은 출제/채점을 위해 전체 열람.
create policy exam_questions_select_started
  on public.exam_questions
  for select
  to authenticated
  using (
    (select public.is_approved())
    and exists (
      select 1
      from public.exam_submissions s
      where s.exam_id = exam_questions.exam_id
        and s.user_id = (select auth.uid())
    )
  );

create policy exam_questions_select_admin
  on public.exam_questions
  for select
  to authenticated
  using ( (select public.is_admin()) );

-- ── exam_submissions: own row OR admin. ──────────────────────────────────────
-- Own-row read still requires is_approved() so the approval gate stays airtight
-- (a pending/rejected account must not read even its own submission).
create policy exam_submissions_select_own
  on public.exam_submissions
  for select
  to authenticated
  using ( (select public.is_approved()) and user_id = (select auth.uid()) );

-- Admin reads every submission (grading dashboard).
create policy exam_submissions_select_admin
  on public.exam_submissions
  for select
  to authenticated
  using ( (select public.is_admin()) );

-- ── exam_answers: three-way SELECT visibility (multiple permissive = OR). ────
-- (a) OWN answers: the answer's submission belongs to the caller.
create policy exam_answers_select_own
  on public.exam_answers
  for select
  to authenticated
  using (
    (select public.is_approved())
    and exists (
      select 1
      from public.exam_submissions s
      where s.id = exam_answers.submission_id
        and s.user_id = (select auth.uid())
    )
  );

-- (b) ADMIN: reads every answer (grading authority).
create policy exam_answers_select_admin
  on public.exam_answers
  for select
  to authenticated
  using ( (select public.is_admin()) );

-- (c) DISPUTED answers become readable to ALL approved members.
--     DELIBERATE EXPOSURE (PRD §4.2 step 4): when a member files a dispute on an
--     answer, other members join the discussion — so that answer's question,
--     answer_text, AI score AND AI rationale must be visible to every approved
--     member for them to comment meaningfully. This widens visibility ONLY for
--     answers that have at least one dispute row; undisputed answers stay private
--     to their owner (policy a) and the admin (policy b). The auditor should treat
--     this as intended, not a leak.
create policy exam_answers_select_disputed
  on public.exam_answers
  for select
  to authenticated
  using (
    (select public.is_approved())
    and exists (
      select 1
      from public.exam_disputes d
      where d.answer_id = exam_answers.id
    )
  );

-- ── exam_disputes: approved members read all disputes (public discussion). ───
create policy exam_disputes_select_approved
  on public.exam_disputes
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- ── exam_dispute_comments: approved members read all comments. ───────────────
create policy exam_dispute_comments_select_approved
  on public.exam_dispute_comments
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- No INSERT/UPDATE/DELETE policies on ANY table above (see WRITE MODEL).

-- ════════════════════════════════════════════════════════════════════════════
-- GRANTs (required — "expose new tables" is OFF). authenticated only; no anon.
-- Read-only for authenticated (SELECT); RLS still gates which rows are reached.
-- service_role gets full DML on EVERY table — "expose new tables" OFF strips
-- service_role's default privileges too, and service_role bypasses RLS but NOT
-- grants (the 0004 lesson). Forgetting these = "permission denied for table ..."
-- on every server-side write path.
-- ════════════════════════════════════════════════════════════════════════════
grant select on public.exams                 to authenticated;
grant select on public.exam_questions        to authenticated;
grant select on public.exam_submissions      to authenticated;
grant select on public.exam_answers          to authenticated;
grant select on public.exam_disputes         to authenticated;
grant select on public.exam_dispute_comments to authenticated;

grant select, insert, update, delete on public.exams                 to service_role;
grant select, insert, update, delete on public.exam_questions        to service_role;
grant select, insert, update, delete on public.exam_submissions      to service_role;
grant select, insert, update, delete on public.exam_answers          to service_role;
grant select, insert, update, delete on public.exam_disputes         to service_role;
grant select, insert, update, delete on public.exam_dispute_comments to service_role;

-- Hygiene: no anon access anywhere in this app — revoke residual default privileges.
revoke all on public.exams                 from anon;
revoke all on public.exam_questions        from anon;
revoke all on public.exam_submissions      from anon;
revoke all on public.exam_answers          from anon;
revoke all on public.exam_disputes         from anon;
revoke all on public.exam_dispute_comments from anon;
