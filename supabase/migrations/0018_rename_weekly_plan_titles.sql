-- 0018_rename_weekly_plan_titles.sql
-- 주차별 계획 제목 개편 + 강의 링크 제거
--
-- 제목은 강의 커리큘럼의 섹션 구성을 참고해 자체 창작한 문구로 교체한다
-- (원문 섹션명을 그대로 옮기지 않음). 같은 섹션을 여러 주에 걸쳐 공부하는
-- 경우 (1), (2)로 회차를 구분한다.
--
-- 메인 페이지 제목에 걸려 있던 외부 강의 링크는 UI에서 제거되었으므로
-- resource_url도 함께 비운다 (컬럼 자체는 유지).

update public.weekly_plans set resource_url = null;

update public.weekly_plans set title = '시작하기 — AI와 함께 일하는 개발자의 첫걸음'          where section_number = 1;
update public.weekly_plans set title = '기본기 다지기 — 핵심 명령어와 컨텍스트 운용'          where section_number = 2;
update public.weekly_plans set title = '미니 프로젝트 — 직접 만들고 세상에 배포하기'          where section_number = 3;

update public.weekly_plans set title = '자동화 워크플로 구축 (1)' where section_number = 4 and week_number = 4;
update public.weekly_plans set title = '자동화 워크플로 구축 (2)' where section_number = 4 and week_number = 5;

update public.weekly_plans set title = '에이전트 오케스트레이션 실전 (1)' where section_number = 5 and week_number = 6;
update public.weekly_plans set title = '에이전트 오케스트레이션 실전 (2)' where section_number = 5 and week_number = 7;
update public.weekly_plans set title = '에이전트 오케스트레이션 실전 (3)' where section_number = 5 and week_number = 8;
update public.weekly_plans set title = '에이전트 오케스트레이션 실전 (4)' where section_number = 5 and week_number = 9;
update public.weekly_plans set title = '에이전트 오케스트레이션 실전 (5)' where section_number = 5 and week_number = 10;
