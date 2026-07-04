-- 0007_unique_open_dispute.sql
-- 감사(Low) 조치: 이의제기 등록 API의 read-then-insert 중복 검사는 동시 요청에
-- 레이스가 있다. 답안당 열린 이의제기 1개를 DB 제약으로 보장한다.
create unique index exam_disputes_one_open_per_answer_idx
  on public.exam_disputes (answer_id)
  where status = 'open';
