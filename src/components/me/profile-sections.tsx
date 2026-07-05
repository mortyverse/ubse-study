import { createAdminClient } from "@/lib/supabase/admin"
import { buildRanking } from "@/lib/ranking"
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
import { LinksDisplay } from "@/components/me/links-display"
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

/**
 * 프로필 공통 섹션 (통계 / 출석 이력 / 링크) — PRD §4.4.
 * 본인 마이페이지(isOwner)와 타인 공개 프로필(/members/[id])이 공유한다.
 * 타인 프로필에서는 제목이 "OO님의 ~"로 바뀌고 링크 폼 대신 읽기 전용이 렌더된다.
 * 데이터는 admin 클라이언트로 조회한다 — 랭킹(실명 공개, PRD §4.4)과 동일하게
 * approved 멤버 간 공개 정보이며, 페이지 진입은 승인 가드가 선행한다.
 */
async function ProfileSections({
  targetId,
  targetName,
  isOwner,
}: {
  targetId: string
  targetName: string
  isOwner: boolean
}) {
  const owner = (suffix: string, mine: string) =>
    isOwner ? mine : `${targetName}님의 ${suffix}`

  const admin = createAdminClient()

  const [ranking, attendanceRes, examsRes, linksRes, finalAnswersRes] = await Promise.all([
    buildRanking(),
    admin
      .from("attendance_records")
      .select("status, checked_at, attendance_sessions!inner(week_number, closes_at)")
      .eq("user_id", targetId)
      .lte("attendance_sessions.closes_at", new Date().toISOString()),
    // 정렬은 아래에서 JS로 처리 (임베드 컬럼 기준 .order() 문법 리스크 회피)
    admin
      .from("exams")
      .select("id, title, week_number")
      .order("week_number", { ascending: true })
      .order("created_at", { ascending: true }),
    admin.from("users").select("github_url, project_url").eq("id", targetId).single(),
    // 점수 추이: 확정(final_score) 점수만 반영 (AI 초안 제외, PRD §4.2 step 6).
    // 그룹 평균 계산에는 전 멤버 데이터가 필요하다 (buildRanking과 동일한 방식).
    admin
      .from("exam_answers")
      .select("final_score, exam_submissions!inner(exam_id, user_id)")
      .not("final_score", "is", null),
  ])

  type FinalAnswerRow = {
    final_score: number
    exam_submissions: { exam_id: string; user_id: string }
  }
  const perExamUserTotals = new Map<string, Map<string, number>>()
  for (const row of (finalAnswersRes.data ?? []) as unknown as FinalAnswerRow[]) {
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
        mine: byUser.get(targetId) ?? 0,
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

  const rankingEntry = ranking.entries.find((e) => e.user_id === targetId)

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl">{owner("통계", "내 통계")}</h2>
        <Card>
          <CardHeader>
            <CardTitle>점수 추이</CardTitle>
            <CardDescription>
              시험별 확정 총점 — {isOwner ? "내" : `${targetName}님의`} 점수(실선)와 전체
              평균(점선)
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

        {rankingEntry && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card size="sm">
              <CardContent className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  {isOwner ? "내 순위" : "순위"}
                </span>
                <span className="font-heading text-2xl font-bold text-foreground">
                  {rankingEntry.rank}위
                </span>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">시험 총점</span>
                <span className="font-heading text-2xl font-bold text-foreground">
                  {Math.round(rankingEntry.exam_total * 10) / 10}
                </span>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">출석률</span>
                <span className="font-heading text-2xl font-bold text-foreground">
                  {Math.round(rankingEntry.attendance_rate * 100)}%
                </span>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">총점</span>
                <span className="font-heading text-2xl font-bold text-primary">
                  {Math.round(rankingEntry.total_score * 10) / 10}
                </span>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl">{owner("출석 이력", "출석 이력")}</h2>
        {attendanceHistory.length === 0 ? (
          <EmptyState
            title="출석 이력이 없습니다"
            description="종료된 출석 세션이 있으면 이곳에 표시됩니다."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
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
        <h2 className="text-xl">{owner("링크", "링크")}</h2>
        {isOwner ? (
          <LinksForm
            githubUrl={linksRes.data?.github_url ?? null}
            projectUrl={linksRes.data?.project_url ?? null}
          />
        ) : (
          <LinksDisplay
            githubUrl={linksRes.data?.github_url ?? null}
            projectUrl={linksRes.data?.project_url ?? null}
          />
        )}
      </section>
    </>
  )
}

export { ProfileSections }
