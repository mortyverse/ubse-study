-- 0003_harden_rls_auto_enable.sql
-- 보안 advisor 조치: public.rls_auto_enable()은 프로젝트 셋업 때 만든
-- "CREATE TABLE 시 RLS 자동 활성화" 이벤트 트리거 함수인데, public 스키마의
-- SECURITY DEFINER 함수라 기본 EXECUTE 권한(PUBLIC)으로 anon/authenticated가
-- /rest/v1/rpc/rls_auto_enable 경로에서 호출 가능한 상태로 노출됐다.
-- (returns event_trigger라 실제 RPC 실행은 실패하지만, 노출 자체를 제거한다.)
-- 이벤트 트리거 실행은 EXECUTE 권한을 검사하지 않으므로 revoke해도 계속 동작한다.

revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;
