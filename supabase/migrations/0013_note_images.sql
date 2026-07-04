-- 0013_note_images.sql
-- 필기노트 이미지 업로드 (공책 필기 사진) — PRD §4.5 확장.
--
-- 필기노트는 기존 마크다운 본문에 더해, 실물 공책 필기를 사진으로 올릴 수
-- 있다. 게시글당 최대 10장, 순서 보존이 필요하므로 별도 테이블 대신
-- board_posts.image_paths text[] 배열 컬럼으로 관리한다 (배열 순서 = 표시 순서).
--
-- WRITE MODEL은 0009와 동일: authenticated에는 쓰기 권한 없음. 업로드는
-- 승인 멤버 전용 service-role 라우트(/api/board/notes/upload)가 처리하고,
-- 경로는 `${author_id}/…`로 발급해 게시글 연결 시 소유권을 접두사로 검증한다.
-- 조회는 상세 페이지가 서버에서 signed URL을 발급해 렌더링한다.

alter table public.board_posts
  add column image_paths text[] not null default '{}';

comment on column public.board_posts.image_paths is
  '필기노트 전용: 공책 필기 사진의 Storage(notes 버킷) 오브젝트 키 배열 (배열 순서 = 표시 순서, 최대 10장). 업로드/조회 모두 service-role API 경유 — 키는 `${author_id}/uuid/파일명` 형태로 발급되어 소유권을 접두사로 검증한다.';

-- 노트가 아닌 카테고리에는 이미지가 붙을 수 없고, 노트도 10장까지.
alter table public.board_posts
  add constraint board_posts_image_paths_max
    check (cardinality(image_paths) <= 10),
  add constraint board_posts_image_paths_note_only
    check (category = 'note' or cardinality(image_paths) = 0);

-- ════════════════════════════════════════════════════════════════════════════
-- Storage: PRIVATE bucket for 필기노트 이미지 (materials 버킷과 동일한 모델)
--   public=false — 직접 접근 없음. 업로드는 service-role 라우트, 표시는
--   서버가 발급하는 단기 signed URL. storage.objects RLS 정책은 의도적으로
--   추가하지 않는다 (0009의 materials와 동일한 이유).
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('notes', 'notes', false)
on conflict (id) do nothing;
