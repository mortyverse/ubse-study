-- ════════════════════════════════════════════════════════════════════════════
-- 0010: board_posts.file_name — 첨부 원본 파일명 보존 (PRD §4.5 강의자료)
--
-- WHY: Supabase Storage의 오브젝트 키는 한글 등 비-ASCII 문자를 허용하지 않아
--   업로드 라우트가 키를 ASCII로 정규화한다("1주차-수업자료.pdf" 같은 이름이
--   그대로 키가 되면 storage-api가 Invalid key로 거부 → 업로드 500).
--   사용자에게 보여줄/다운로드될 원본 파일명은 별도 컬럼에 보존하고,
--   signed URL 발급 시 Content-Disposition(download=<file_name>)으로 복원한다.
--
-- 새 GRANT 불필요: 컬럼은 테이블 GRANT(authenticated SELECT / service_role 전체)를
-- 그대로 상속하며 비밀 값이 아니다.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.board_posts
  add column file_name text
  check (file_name is null or char_length(file_name) <= 200);

comment on column public.board_posts.file_name is
  '첨부 원본 파일명(표시/다운로드용). 실제 storage 키는 file_path(ASCII 정규화).';
