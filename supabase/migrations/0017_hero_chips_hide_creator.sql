-- ════════════════════════════════════════════════════════════════════════════
-- 0017: hero_chips.created_by 은닉 — 컬럼 단위 GRANT로 전환
--   * created_by는 부적절한 문구 추가자를 관리자가 SQL로 직접 추적하는 용도.
--     앱 화면/API로는 절대 노출되지 않아야 하므로, 클라이언트가 supabase-js로
--     직접 조회하는 경로(authenticated)에서 컬럼 자체를 읽을 수 없게 막는다.
--   * service_role(서버 API + 대시보드 SQL)은 기존 전체 권한 유지.
--   * 주의: 이후 authenticated 클라이언트의 select("*")는 실패한다 —
--     반드시 명시적 컬럼 목록(id, label, color, created_at)으로 조회할 것.
-- ════════════════════════════════════════════════════════════════════════════
revoke select on public.hero_chips from authenticated;
grant select (id, label, color, created_at) on public.hero_chips to authenticated;
