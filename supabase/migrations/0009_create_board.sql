-- 0009_create_board.sql
-- Phase 4 — 게시판 (PRD §4.5: 자유게시판 / 강의자료 / 필기노트)
--
-- One board menu with three tabs, modeled as a single board_posts table keyed by
-- a `category` enum ('free','material','note') + a board_comments table. Plus a
-- PRIVATE Storage bucket for 강의자료 file attachments (PDF/slides).
--
-- Reuses public.set_updated_at() and public.is_approved() from 0001.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WRITE MODEL (intentional — mirrors 0002/0005/0008):
--   NO write policies and NO write grants for `authenticated` on either table.
--   Every mutation flows through Next.js Route Handlers using the service_role
--   key, where the following per-tab invariants are enforced server-side:
--     * 자유게시판 (free) 작성/댓글  → any approved member
--     * 강의자료   (material) 작성   → ADMIN ONLY (주차별 계획과 연동, week_number)
--     * 필기노트   (note) 작성        → any approved member (본인 노트)
--     * 수정·삭제 (posts)            → 본인 글만 (강의자료는 admin) — PRD §4.5
--     * 댓글 작성                    → any approved member; 삭제는 본인만
--   `authenticated` therefore gets read-only visibility (SELECT grants + SELECT
--   policies below). Client-side writes are forbidden by design.
--
-- READ MODEL: 세 탭 모두 조회는 전체 공개. 필기노트도 열람은 전체 스터디원에게
--   공개되고 수정/삭제만 본인으로 제한된다 (PRD §4.5). 따라서 board_posts SELECT은
--   category 구분 없이 approved 멤버 전체에게 허용한다.
-- ════════════════════════════════════════════════════════════════════════════

-- Enum values verbatim from the PRD §4.5 DB block: ('free','material','note').
create type public.board_category as enum ('free', 'material', 'note');

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.board_posts  (PRD §4.5)
--   Base columns from the PRD block: category, author_id, title, content_markdown,
--   link_url, week_number. file_path added as housekeeping (a pointer to the
--   Storage object for 강의자료 PDFs — PRD "파일 첨부는 Storage에 저장").
--   created_at/updated_at are housekeeping.
-- ════════════════════════════════════════════════════════════════════════════
create table public.board_posts (
  id               uuid primary key default gen_random_uuid(),
  category         public.board_category not null,
  author_id        uuid not null references public.users (id) on delete cascade,
  title            text not null check (length(title) <= 200),
  content_markdown text,
  link_url         text,
  week_number      int  check (week_number between 1 and 10),
  file_path        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.board_posts is
  'PRD §4.5 게시판 posts across three tabs (category enum). Read: all approved members (all tabs public to the group). All writes via service role — free/note by any approved member, material by admin only; edit/delete restricted to author (material = admin).';
comment on column public.board_posts.category is
  'Tab discriminator: free(자유게시판) | material(강의자료, admin-only write) | note(필기노트, markdown).';
comment on column public.board_posts.week_number is
  'Nullable — set only when a 강의자료 post is linked to a specific curriculum week (1–10, 주차별 계획 연동).';
comment on column public.board_posts.file_path is
  'Housekeeping (not in PRD block): pointer to the private `materials` Storage object for a 강의자료 attachment. Upload/download go through service-role API routes.';

create trigger board_posts_set_updated_at
  before update on public.board_posts
  for each row execute function public.set_updated_at();

-- (category, created_at desc): 탭별 목록 조회 — the primary board query.
create index board_posts_category_created_at_idx
  on public.board_posts (category, created_at desc);
-- author_id FK (본인 글 조회/수정 권한 확인; unindexed FKs flagged by advisor).
create index board_posts_author_id_idx on public.board_posts (author_id);
-- week_number (강의자료 ↔ 주차별 계획 연동 lookups).
create index board_posts_week_number_idx on public.board_posts (week_number);

-- ════════════════════════════════════════════════════════════════════════════
-- Table: public.board_comments  (PRD §4.5)
-- ════════════════════════════════════════════════════════════════════════════
create table public.board_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.board_posts (id) on delete cascade,
  author_id  uuid not null references public.users (id) on delete cascade,
  content    text not null check (length(content) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.board_comments is
  'Comments on board posts. Read: all approved members. Writes via service role — any approved member may comment; delete restricted to the comment author.';

create trigger board_comments_set_updated_at
  before update on public.board_comments
  for each row execute function public.set_updated_at();

-- post_id FK (list a post's comments) and author_id FK (본인 댓글 삭제 확인).
create index board_comments_post_id_idx   on public.board_comments (post_id);
create index board_comments_author_id_idx on public.board_comments (author_id);

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security  (SELECT-only; all writes via service role — see WRITE MODEL)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.board_posts    enable row level security;
alter table public.board_comments enable row level security;

-- ── board_posts: approved members read ALL posts across all three tabs. ──────
-- 필기노트 포함 모든 탭의 게시글은 조회 전체 공개(PRD §4.5); 수정/삭제만 API에서
-- 본인(강의자료는 admin)으로 제한. pending/rejected 계정은 승인 게이트에 막힌다.
create policy board_posts_select_approved
  on public.board_posts
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- ── board_comments: approved members read all comments. ──────────────────────
create policy board_comments_select_approved
  on public.board_comments
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- No INSERT/UPDATE/DELETE policies on either table (see WRITE MODEL).

-- ════════════════════════════════════════════════════════════════════════════
-- GRANTs (required — "expose new tables" is OFF). authenticated read-only;
-- service_role full DML. "expose new tables" OFF strips service_role's default
-- privileges too, and service_role bypasses RLS but NOT grants (the 0004 lesson)
-- — omitting the service_role grant = "permission denied" on every write path.
-- ════════════════════════════════════════════════════════════════════════════
grant select on public.board_posts    to authenticated;
grant select on public.board_comments to authenticated;

grant select, insert, update, delete on public.board_posts    to service_role;
grant select, insert, update, delete on public.board_comments to service_role;

-- Hygiene: no anon access anywhere in this app — revoke residual defaults.
revoke all on public.board_posts    from anon;
revoke all on public.board_comments from anon;

-- ════════════════════════════════════════════════════════════════════════════
-- Storage: PRIVATE bucket for 강의자료 attachments  (PRD §4.5 파일 첨부)
--   public=false → objects are NOT served over the public CDN. Access is fully
--   mediated by service-role API routes:
--     * admin uploads a 강의자료 file (service role, bypasses storage RLS)
--     * approved members download via a short-lived SIGNED URL minted server-side
--   No storage.objects RLS policies are added for authenticated/anon — there is
--   deliberately no direct client access to this bucket. service_role bypasses
--   storage RLS, so no policy is needed for the server paths.
--   NOTE: Supabase manages grants on the `storage` schema itself — do NOT alter
--   storage-schema grants here.
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;
