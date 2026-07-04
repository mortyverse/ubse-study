import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { buildDashboardStats } from "@/lib/stats"
import { buildRanking } from "@/lib/ranking"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { LandingHero } from "@/components/home/landing-hero"
import {
  ScoreTrendChart,
  AttendanceTrendChart,
  type WeeklyChartPoint,
} from "@/components/home/dashboard-charts"
import { ComparisonTile } from "@/components/home/comparison-tile"
import { WeeklyPlanPanel } from "@/components/home/weekly-plan-panel"
import type { WeeklyPlan } from "@/lib/types"

const round1 = (n: number) => Math.round(n * 10) / 10

export default async function Home() {
  const { profile } = await getSessionProfile()

  // 로그아웃/미승인 방문자 — 기존 마케팅 히어로 그대로 (PRD §4.7 대상 아님).
  if (!profile || profile.status !== "approved") {
    return <LandingHero />
  }

  const supabase = await createClient()
  const [stats, ranking, plansRes] = await Promise.all([
    buildDashboardStats(profile.id),
    buildRanking(),
    supabase
      .from("weekly_plans")
      .select("*")
      .order("week_number", { ascending: true })
      .order("section_number", { ascending: true }),
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
  const isAdmin = profile.role === "admin"

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-4 pt-28 pb-12 md:pt-32">
        <PageHeader
          eyebrow="DASHBOARD"
          title="메인"
          description={`${profile.display_name}님, 오늘도 좋은 하루 보내세요.`}
        />
      </Container>

      {/* 통계 3종 — 하나의 라벤더 밴드로 아래 주차 계획 표와 리듬을 구분 (연속 컬러 밴드 금지). */}
      <section className="bg-band-lavender py-16 md:py-20">
        <Container className="flex flex-col gap-8">
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

      {/* 주차별 계획 표 — 라벤더 밴드 다음이므로 흰 배경으로 되돌아온다. */}
      <Container className="flex flex-col gap-6 py-16 md:py-20">
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
    </main>
  )
}
