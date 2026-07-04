-- 0004_grant_service_role.sql
-- 버그 수정: "Automatically expose new tables" OFF 설정은 anon/authenticated뿐
-- 아니라 service_role의 기본 테이블 권한도 제거한다. 0001/0002는 authenticated에만
-- grant해서, 서버 API 라우트의 service-role 클라이언트(세션 시작/코드 검증/시딩 등
-- 모든 쓰기 경로)가 "permission denied for table ..."로 실패했다.
--
-- 규칙: 앞으로 모든 새 테이블은 authenticated(필요 컬럼/동작만) + service_role(전체 DML)
-- 두 role에 명시적으로 grant한다. service_role은 RLS를 우회하지만 GRANT는 우회하지 못한다.

grant select, insert, update, delete on public.users               to service_role;
grant select, insert, update, delete on public.attendance_sessions to service_role;
grant select, insert, update, delete on public.attendance_records  to service_role;

-- 위생: 이 앱에 anon 접근은 전혀 없다 — 잔여 기본 권한(REFERENCES/TRIGGER/TRUNCATE) 회수
revoke all on public.users               from anon;
revoke all on public.attendance_sessions from anon;
revoke all on public.attendance_records  from anon;
