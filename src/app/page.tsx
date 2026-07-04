import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { buildGroupTrends, type GroupTrendPoint } from "@/lib/stats"
import { Container } from "@/components/layout/container"
import { EmptyState } from "@/components/common/empty-state"
import { LandingHero } from "@/components/home/landing-hero"
import { GravityHero } from "@/components/home/gravity-hero"
import { StatsSlider, type GroupChartRow } from "@/components/home/stats-slider"
import { WeeklyPlanPanel } from "@/components/home/weekly-plan-panel"
import type { HeroChip, PlanLecture, WeeklyPlan } from "@/lib/types"

/** GroupTrendPoint → recharts 평면 행 ({ label, average, [memberId]: value }) */
function toChartRows(points: GroupTrendPoint[]): GroupChartRow[] {
  return points.map((p) => ({
    label: `${p.week}주차`,
    average: p.average,
    ...p.values,
  }))
}

export default async function Home() {
  const { profile } = await getSessionProfile()

  // 로그아웃/미승인 방문자 — 기존 마케팅 히어로 그대로 (PRD §4.7 대상 아님).
  if (!profile || profile.status !== "approved") {
    return <LandingHero />
  }

  const supabase = await createClient()
  const [trends, plansRes, chipsRes, lecturesRes] = await Promise.all([
    buildGroupTrends(),
    supabase
      .from("weekly_plans")
      .select("*")
      .order("week_number", { ascending: true })
      .order("section_number", { ascending: true }),
    supabase
      .from("hero_chips")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("plan_lectures")
      .select("*")
      .order("lecture_number", { ascending: true }),
  ])

  const plans = (plansRes.data ?? []) as WeeklyPlan[]
  const heroChips = (chipsRes.data ?? []) as HeroChip[]
  const planLectures = (lecturesRes.data ?? []) as PlanLecture[]
  const isAdmin = profile.role === "admin"

  return (
    /* 풀페이지 스냅 스크롤 — 각 섹션이 화면 하나를 차지하고 페이지처럼 전환된다.
       스크롤은 이 컨테이너 안에서만 일어나며 스크롤바는 감춘다. */
    <main className="h-dvh snap-y snap-mandatory overflow-y-scroll scrollbar-hidden">
      {/* 1페이지 — 물리 인터랙션 히어로 */}
      <section className="h-dvh snap-start">
        <GravityHero initialChips={heroChips} isAdmin={isAdmin} />
      </section>

      {/* 2페이지 — 통계 슬라이더 (점수 추이 ↔ 출석률 추이, 멤버 전원 표시) */}
      <section className="h-dvh snap-start overflow-y-auto scrollbar-hidden">
        <Container className="flex min-h-full flex-col justify-center py-24">
          <StatsSlider
            viewerId={profile.id}
            members={trends.members}
            scoreData={toChartRows(trends.scoreTrend)}
            attendanceData={toChartRows(trends.attendanceTrend)}
          />
        </Container>
      </section>

      {/* 3페이지 — 주차별 계획 (흰 배경). 표가 길면 섹션 안에서만 스크롤. */}
      <section className="h-dvh snap-start overflow-y-auto scrollbar-hidden">
        <Container className="flex min-h-full flex-col justify-center gap-6 pt-24 pb-10">
          <h2 className="text-center text-3xl">주차별 계획</h2>
          {plans.length === 0 ? (
            <EmptyState
              title="등록된 주차별 계획이 없습니다"
              description="관리자가 커리큘럼을 등록하면 이곳에 표시됩니다."
            />
          ) : (
            <WeeklyPlanPanel
              initialPlans={plans}
              initialLectures={planLectures}
              isAdmin={isAdmin}
            />
          )}
        </Container>
      </section>
    </main>
  )
}
