-- ════════════════════════════════════════════════════════════════════════════
-- 0011: hero_chips — 메인 히어로의 중력 블록(칩)을 공유 데이터로 저장
--   * 승인 멤버 누구나 추가(서비스롤 API 경유), admin만 삭제
--   * 색상은 디자인 토큰 7종 키만 허용 (클라이언트에서 클래스로 매핑)
--   * 기존 하드코딩 7개 칩을 시드로 이전
-- ════════════════════════════════════════════════════════════════════════════
create table public.hero_chips (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 20),
  color text not null check (
    color in ('violet', 'slate', 'sage', 'terracotta', 'amber', 'peach', 'pink')
  ),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.hero_chips enable row level security;

-- 읽기: 승인 멤버만. 쓰기 정책은 만들지 않는다 — 추가/삭제는 서비스롤 API 전용.
create policy hero_chips_select_approved on public.hero_chips
  for select to authenticated
  using ((select is_approved()));

-- auto-expose OFF: 명시적 GRANT 필수 (service_role은 RLS는 우회하지만 GRANT는 아님)
grant select on public.hero_chips to authenticated;
grant select, insert, update, delete on public.hero_chips to service_role;
revoke all on public.hero_chips from anon;

-- 기존 히어로 칩 7종 시드
insert into public.hero_chips (label, color) values
  ('출석', 'violet'),
  ('시험', 'slate'),
  ('AI 채점', 'sage'),
  ('게시판', 'terracotta'),
  ('필기노트', 'amber'),
  ('랭킹', 'peach'),
  ('주차별 계획', 'pink');
