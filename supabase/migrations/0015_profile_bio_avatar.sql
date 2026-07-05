-- 0015_profile_bio_avatar.sql
-- 마이페이지 프로필: 한 줄 소개(bio) + 프로필 사진 업로드 (PRD §4.4 확장).
--
-- display_name / avatar_url 은 0001에서 GitHub OAuth 초기값으로 이미 존재한다.
-- 이 마이그레이션은 (1) 한 줄 소개 컬럼, (2) 프로필 사진 업로드용 Storage 버킷만 추가한다.
--
-- WRITE MODEL은 0006의 github_url/project_url과 동일, BY DESIGN:
--   * authenticated 에는 users self-UPDATE RLS 정책이 없다. display_name/bio/avatar_url
--     수정은 고정 payload service-role 라우트(/api/me/profile, /api/me/avatar)만이
--     본인 행에 한해 수행한다 — role/status/점수 컬럼은 여전히 멤버가 만질 수 없다.
--   * 조회는 0001의 SELECT 정책(본인 + approved peers + admin)이 이미 커버한다.
--     공개 프로필(/members/[id])은 approved 멤버 간 실명 공개(PRD §4.4)와 같은 노출 범위다.

alter table public.users
  add column bio text,
  add constraint users_bio_max_length check (char_length(bio) <= 100);

comment on column public.users.bio is
  '한 줄 소개 (최대 100자, 초기값 없음). 본인이 마이페이지에서 등록/수정 — 고정 payload service-role 라우트(/api/me/profile) 경유만 허용.';

-- ════════════════════════════════════════════════════════════════════════════
-- Storage: PUBLIC bucket for 프로필 사진
--   avatar_url 은 원래 GitHub CDN의 공개 URL을 담는 컬럼이므로, 업로드 사진도
--   동일하게 공개 URL로 서빙한다 (nav/랭킹/게시판 등 노출 지점이 많아 signed URL
--   부적합). 쓰기는 service-role 라우트(/api/me/avatar) 전용 — storage.objects 에
--   authenticated 정책을 추가하지 않으므로 직접 업로드는 불가능하다 (0009/0013과
--   동일한 모델, public 읽기만 다름).
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
