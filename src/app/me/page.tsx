import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildRanking } from "@/lib/ranking"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { StatusBadge } from "@/components/common/status-badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { ScoreChart, type ScoreTrendPoint } from "@/components/me/score-chart"
import { LinksForm } from "@/components/me/links-form"
import { RankingTable } from "@/components/me/ranking-table"
import type { AttendanceStatus } from "@/lib/types"

function formatCheckedAt(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function MyPage() {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const supabase = await createClient()

  const [ranking, attendanceRes, examsRes, myLinksRes] = await Promise.all([
    buildRanking(),
    supabase
      .from("attendance_records")
      .select("status, checked_at, attendance_sessions!inner(week_number, closes_at)")
      .eq("user_id", profile.id)
      .lte("attendance_sessions.closes_at", new Date().toISOString()),
    // 정렬은 아래에서 JS로 처리 (임베드 컬럼 기준 .order() 문법 리스크 회피)
    supabase
      .from("exams")
      .select("id, title, week_number")
      .order("week_number", { ascending: true })
      .order("created_at", { ascending: true }),
    // AppUser 타입 계약(src/lib/types.ts)에는 github_url/project_url이 없어
    // (0006에서 users에 추가된 컬럼 — 타입 계약 파일은 건드리지 않는다) 별도 조회한다.
    supabase.from("users").select("github_url, project_url").eq("id", profile.id).single(),
  ])

  // 점수 추이: 확정(final_score) 점수만 반영 (AI 초안 제외, PRD §4.2 step 6).
  // 그룹 평균 계산에는 전 멤버 데이터가 필요해 admin 클라이언트로 직접 조회한다
  // (본인 세션 RLS로는 타인의 exam_answers를 읽을 수 없다 — buildRanking과 동일한 방식).
  const admin = createAdminClient()
  const { data: finalAnswers } = await admin
    .from("exam_answers")
    .select("final_score, exam_submissions!inner(exam_id, user_id)")
    .not("final_score", "is", null)

  type FinalAnswerRow = {
    final_score: number
    exam_submissions: { exam_id: string; user_id: string }
  }
  const perExamUserTotals = new Map<string, Map<string, number>>()
  for (const row of (finalAnswers ?? []) as unknown as FinalAnswerRow[]) {
    const examId = row.exam_submissions.exam_id
    const byUser = perExamUserTotals.get(examId) ?? new Map<string, number>()
    byUser.set(
      row.exam_submissions.user_id,
      (byUser.get(row.exam_submissions.user_id) ?? 0) + Number(row.final_score),
    )
    perExamUserTotals.set(examId, byUser)
  }

  const chartData: ScoreTrendPoint[] = (examsRes.data ?? [])
    .filter((exam) => perExamUserTotals.has(exam.id))
    .map((exam) => {
      const byUser = perExamUserTotals.get(exam.id)!
      const values = [...byUser.values()]
      const average = values.reduce((a, b) => a + b, 0) / values.length
      return {
        label: `${exam.week_number}주차`,
        mine: byUser.get(profile.id) ?? 0,
        average: Math.round(average * 10) / 10,
      }
    })

  type AttendanceRow = {
    status: AttendanceStatus
    checked_at: string | null
    attendance_sessions: { week_number: number; closes_at: string }
  }
  const attendanceHistory = (
    (attendanceRes.data ?? []) as unknown as AttendanceRow[]
  ).sort((a, b) => a.attendance_sessions.week_number - b.attendance_sessions.week_number)

  const myRankingEntry = ranking.entries.find((e) => e.user_id === profile.id)

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-12 pt-28 pb-20 md:pt-32">
        <PageHeader eyebrow="MY PAGE" title="마이페이지" />

        <section className="flex flex-col gap-4">
          <h2 className="text-xl">내 통계</h2>
          <Card>
            <CardHeader>
              <CardTitle>점수 추이</CardTitle>
              <CardDescription>
                시험별 확정 총점 — 내 점수(실선)와 전체 평균(점선)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <EmptyState
                  title="확정된 점수가 아직 없습니다"
                  description="관리자가 시험 채점을 확정하면 이곳에 추이가 표시됩니다."
                  className="py-10"
                />
              ) : (
                <ScoreChart data={chartData} />
              )}
            </CardContent>
          </Card>

          {myRankingEntry && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">내 순위</span>
                  <span className="font-heading text-2xl font-bold text-foreground">
                    {myRankingEntry.rank}위
                  </span>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">시험 총점</span>
                  <span className="font-heading text-2xl font-bold text-foreground">
                    {Math.round(myRankingEntry.exam_total * 10) / 10}
                  </span>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">출석률</span>
                  <span className="font-heading text-2xl font-bold text-foreground">
                    {Math.round(myRankingEntry.attendance_rate * 100)}%
                  </span>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">총점</span>
                  <span className="font-heading text-2xl font-bold text-primary">
                    {Math.round(myRankingEntry.total_score * 10) / 10}
                  </span>
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl">출석 이력</h2>
          {attendanceHistory.length === 0 ? (
            <EmptyState
              title="출석 이력이 없습니다"
              description="종료된 출석 세션이 있으면 이곳에 표시됩니다."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {attendanceHistory.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="p-3 text-muted-foreground">
                        {row.attendance_sessions.week_number}주차
                      </td>
                      <td className="p-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatCheckedAt(row.checked_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl">링크</h2>
          <LinksForm
            githubUrl={myLinksRes.data?.github_url ?? null}
            projectUrl={myLinksRes.data?.project_url ?? null}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl">전체 랭킹</h2>
          <RankingTable entries={ranking.entries} viewerId={profile.id} />
          <p className="text-sm text-muted-foreground">
            총점 = 시험 확정 점수 합 + 출석률 × 가중치(현재 {ranking.settings.attendance_weight})
          </p>
        </section>
      </Container>
    </main>
  )
}
