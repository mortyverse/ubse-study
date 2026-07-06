-- 0019_create_post_likes.sql
-- 필기노트 좋아요 (하트)
--
-- 필기노트(note) 게시글에 승인 멤버가 좋아요를 누를 수 있다.
--   * 1인 1게시글 1좋아요 — PK (post_id, user_id)로 강제
--   * 본인 글 좋아요 금지, note 카테고리 한정 — API 라우트에서 검증
--   * 받은 좋아요 1개 = 총점 +1점으로 랭킹에 반영 (src/lib/ranking.ts)
--
-- WRITE MODEL (0002/0005/0008/0009와 동일): authenticated는 SELECT만.
-- 좋아요 토글은 service-role API 라우트(POST /api/board/posts/[id]/like)를
-- 통해서만 이루어진다 — 클라이언트 직접 쓰기는 RLS/GRANT 양쪽에서 차단.

create table public.post_likes (
  post_id    uuid not null references public.board_posts (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

comment on table public.post_likes is
  '필기노트 좋아요. 1인 1글 1개(PK). note 전용·본인 글 금지는 API 라우트에서 검증. 받은 좋아요 수는 랭킹 총점에 +1점/개로 반영.';

-- user_id FK 보조 인덱스 (post_id는 PK 선두 컬럼이라 커버됨).
create index post_likes_user_id_idx on public.post_likes (user_id);

-- ── RLS: 승인 멤버 조회만, 쓰기 정책 없음 (service role 경유) ────────────────
alter table public.post_likes enable row level security;

create policy post_likes_select_approved
  on public.post_likes
  for select
  to authenticated
  using ( (select public.is_approved()) );

-- GRANTs (expose OFF): read-only to authenticated; full DML to service_role.
grant select on public.post_likes to authenticated;
grant select, insert, update, delete on public.post_likes to service_role;

-- Hygiene: no anon access.
revoke all on public.post_likes from anon;
