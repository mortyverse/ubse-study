-- 0014_auto_confirm_grades.sql
-- 채점 자동 확정 전환 (owner 결정, 2026-07-05) — 데이터 백필.
--
-- 정책 변경: AI 1차 채점 결과는 기본적으로 그대로 확정된다
-- (final_score = ai_score, resolved_by/resolved_at null = AI 자동확정 표식).
-- 응시자가 이의제기하면 확정이 해제되고, 토론 후 관리자가 재확정한다.
-- 관리자가 모든 문항을 일일이 확정할 필요가 없도록 하기 위함.
--
-- 이 마이그레이션은 기존 데이터를 새 체제로 옮긴다: 채점 완료된 제출의
-- 미확정 답안(final_score null, 열린 이의제기 없음)에 AI 점수를 확정으로 복사.
-- 관리자가 이미 확정한 답안(final_score non-null)은 건드리지 않는다.

update public.exam_answers a
set final_score = a.ai_score
from public.exam_submissions s
where s.id = a.submission_id
  and s.grading_status = 'completed'
  and a.final_score is null
  and a.ai_score is not null
  and not exists (
    select 1
    from public.exam_disputes d
    where d.answer_id = a.id
      and d.status = 'open'
  );
