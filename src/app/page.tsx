import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { buildDashboardStats } from "@/lib/stats"
import { buildRanking } from "@/lib/ranking"
import { Container } from "@/components/layout/container"
import { EmptyState } from "@/components/common/empty-state"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { LandingHero } from "@/components/home/landing-hero"
import { GravityHero } from "@/components/home/gravity-hero"
import {
  ScoreTrendChart,
  AttendanceTrendChart,
  type WeeklyChartPoint,
} from "@/components/home/dashboard-charts"
import { ComparisonTile } from "@/components/home/comparison-tile"
import { WeeklyPlanPanel } from "@/components/home/weekly-plan-panel"
import type { HeroChip, WeeklyPlan } from "@/lib/types"

const round1 = (n: number) => Math.round(n * 10) / 10

export default async function Home() {
  const { profile } = await getSessionProfile()

  // 로그아웃/미승인 방문자 — 기존 마케팅 히어로 그대로 (PRD §4.7 대상 아님).
  if (!profile || profile.status !== "approved") {
    return <LandingHero />
  }

  const supabase = await createClient()
  const [stats, ranking, plansRes, chipsRes] = await Promise.all([
    buildDashboardStats(profile.id),
    buildRanking(),
    supabase
      .from("weekly_plans")
      .select("*")
      .order("week_number", { ascending: true })
      .order("section_number", { ascending: true }),
    supabase
      .from("hero_chips")
      .select("*")
      .order("created_at", { ascending: true }),
  ])

  const scoreData: WeeklyChartPoint[] = stats.scoreTrend.map((p) => ({
    label: `${p.week}주차`,
    mine: p.mine,
    average: p.average,
  }))
  const attendanceData: WeeklyChartPoint[] = stats.attendanceTrend.map((p) => ({
    label: `${p.week}주차`,
    mine: p.mine,
    average: p.average,
  }))

  const myRankingEntry = ranking.entries.find((e) => e.user_id === profile.id)
  const groupCount = ranking.entries.length
  const avgExamTotal =
    groupCount > 0
      ? ranking.entries.reduce((sum, e) => sum + e.exam_total, 0) / groupCount
      : 0
  const avgAttendanceRate =
    groupCount > 0
      ? ranking.entries.reduce((sum, e) => sum + e.attendance_rate, 0) /
        groupCount
      : 0

  const plans = (plansRes.data ?? []) as WeeklyPlan[]
  const heroChips = (chipsRes.data ?? []) as HeroChip[]
  const isAdmin = profile.role === "admin"

  return (
    /* 풀페이지 스냅 스크롤 — 각 섹션이 화면 하나를 차지하고 페이지처럼 전환된다.
       스크롤은 이 컨테이너 안에서만 일어나며 스크롤바는 감춘다. */
    <main className="h-dvh snap-y snap-mandatory overflow-y-scroll scrollbar-hidden">
      {/* 1페이지 — 물리 인터랙션 히어로 */}
      <section className="h-dvh snap-start">
        <GravityHero initialChips={heroChips} isAdmin={isAdmin} />
      </section>

      {/* 2페이지 — 통계 (라벤더 밴드). 화면보다 길어지면 섹션 안에서만 스크롤. */}
      <section className="h-dvh snap-start overflow-y-auto scrollbar-hidden bg-band-lavender">
        <Container className="flex min-h-full flex-col justify-center gap-8 py-24">
          <h2 className="text-xl">통계</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>주차별 평균 점수 추이</CardTitle>
                <CardDescription>
                  확정 시험 총점 — 내 점수(실선)와 전체 평균(점선)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scoreData.length === 0 ? (
                  <EmptyState
                    title="아직 확정된 점수가 없습니다"
                    description="관리자가 시험 채점을 확정하면 이곳에 추이가 표시됩니다."
                    className="py-10"
                  />
                ) : (
                  <ScoreTrendChart data={scoreData} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>주차별 출석률 추이</CardTitle>
                <CardDescription>
                  종료된 세션 기준 — 내 출석률(실선)과 전체 평균(점선)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attendanceData.length === 0 ? (
                  <EmptyState
                    title="아직 종료된 출석 세션이 없습니다"
                    description="출석 세션이 종료되면 이곳에 추이가 표시됩니다."
                    className="py-10"
                  />
                ) : (
                  <AttendanceTrendChart data={attendanceData} />
                )}
              </CardContent>
            </Card>
          </div>

          {myRankingEntry ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <ComparisonTile
                label="내 시험 총점 vs 전체 평균"
                mineValue={round1(myRankingEntry.exam_total)}
                averageValue={round1(avgExamTotal)}
                formatValue={(n) => String(n)}
              />
              <ComparisonTile
                label="내 출석률 vs 전체 평균"
                mineValue={Math.round(myRankingEntry.attendance_rate * 100)}
                averageValue={Math.round(avgAttendanceRate * 100)}
                formatValue={(n) => `${n}%`}
                barMax={100}
              />
            </div>
          ) : (
            <EmptyState
              title="아직 비교할 데이터가 없습니다"
              description="시험 채점이 확정되고 출석 세션이 종료되면 비교 정보가 표시됩니다."
              className="py-10"
            />
          )}
        </Container>
      </section>

      {/* 3페이지 — 주차별 계획 (흰 배경). 표가 길면 섹션 안에서만 스크롤. */}
      <section className="h-dvh snap-start overflow-y-auto scrollbar-hidden">
        <Container className="flex min-h-full flex-col gap-6 py-24">
          <h2 className="text-xl">주차별 계획</h2>
          {plans.length === 0 ? (
            <EmptyState
              title="등록된 주차별 계획이 없습니다"
              description="관리자가 커리큘럼을 등록하면 이곳에 표시됩니다."
            />
          ) : (
            <WeeklyPlanPanel initialPlans={plans} isAdmin={isAdmin} />
          )}
        </Container>
      </section>
    </main>
  )
}
