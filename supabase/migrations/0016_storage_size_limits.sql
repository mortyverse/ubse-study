-- 0016_storage_size_limits.sql
-- 업로드 방식 전환에 따른 버킷 레벨 용량/타입 강제.
--
-- Vercel 서버리스 함수는 요청 본문을 ~4.5MB로 제한하므로, 파일이 API 라우트를
-- 경유하는 기존 업로드는 prod에서 대용량이 통과할 수 없다. 업로드를
-- "서버는 signed upload URL(토큰)만 발급, 브라우저가 Storage로 직접 업로드"
-- 방식으로 전환한다 — 권한 검증(admin/승인/본인 경로)과 확장자 검사는 여전히
-- 토큰 발급 라우트에서 수행되고, 직접 업로드라 서버가 크기를 재검증할 수 없는
-- 부분은 아래 버킷 레벨 file_size_limit이 Storage 서버에서 강제한다.
--
-- avatars는 public 버킷이므로 allowed_mime_types로 이미지 외 content-type
-- 저장을 Storage 레벨에서 차단한다 (직접 업로드 전환으로 라우트의
-- content-type 유도가 사라지는 것을 보상).

update storage.buckets set file_size_limit = 52428800  -- 50MB (강의 교안 ~40MB 대응)
where id = 'materials';

update storage.buckets set file_size_limit = 10485760  -- 10MB (필기 사진 장당)
where id = 'notes';

update storage.buckets
set file_size_limit = 5242880,                          -- 5MB (프로필 사진)
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
where id = 'avatars';
