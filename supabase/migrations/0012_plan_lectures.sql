-- ════════════════════════════════════════════════════════════════════════════
-- 0012: plan_lectures — 강의(1~39강) 단위의 주차 배정
--   * 주차별 계획의 "강의 범위" 텍스트(weekly_plans.lecture_range)를 강의 단위
--     블록으로 분해 — admin이 드래그앤드랍으로 강의를 다른 주차로 옮길 수 있다
--     (실제 진도가 계획과 어긋날 때 보정용).
--   * weekly_plans.lecture_range는 그대로 두되 UI에서는 이 테이블이 우선한다.
--   * 이동은 admin 전용 서비스롤 API(PATCH /api/plan-lectures/[n])로만 쓴다.
-- ════════════════════════════════════════════════════════════════════════════
create table public.plan_lectures (
  lecture_number int primary key check (lecture_number >= 1),
  week_number int not null check (week_number between 1 and 10),
  updated_at timestamptz not null default now()
);

alter table public.plan_lectures enable row level security;

-- 읽기: 승인 멤버만. 쓰기 정책 없음 — 서비스롤 API 전용.
create policy plan_lectures_select_approved on public.plan_lectures
  for select to authenticated
  using ((select is_approved()));

grant select on public.plan_lectures to authenticated;
grant select, insert, update, delete on public.plan_lectures to service_role;
revoke all on public.plan_lectures from anon;

-- 시드: 0008의 lecture_range와 동일한 매핑 (PRD 원문 그대로)
insert into public.plan_lectures (lecture_number, week_number)
select gs, 1  from generate_series(1, 6)   gs union all
select gs, 2  from generate_series(7, 14)  gs union all
select gs, 3  from generate_series(15, 17) gs union all
select gs, 4  from generate_series(18, 20) gs union all
select gs, 5  from generate_series(21, 24) gs union all
select gs, 6  from generate_series(25, 27) gs union all
select gs, 7  from generate_series(28, 32) gs union all
select gs, 8  from generate_series(33, 35) gs union all
select gs, 9  from generate_series(36, 36) gs union all
select gs, 10 from generate_series(37, 39) gs;
