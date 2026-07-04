import Link from "next/link"
import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import { ExamStatusBadge } from "@/components/exams/exam-status-badge"
import { deriveExamStatus } from "@/components/exams/status"
import type { GradingStatus } from "@/lib/types"

export default async function ExamsPage() {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const supabase = await createClient()
  const [{ data: exams }, { data: submissions }] = await Promise.all([
    supabase
      .from("exams")
      .select("id, title, week_number, time_limit_minutes")
      .order("week_number", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("exam_submissions")
      .select("id, exam_id, submitted_at, grading_status")
      .eq("user_id", profile.id),
  ])

  const submissionByExam = new Map(
    (submissions ?? []).map((s) => [s.exam_id, s]),
  )

  const rows = (exams ?? []).map((exam) => {
    const submission = submissionByExam.get(exam.id) ?? null
    const status = deriveExamStatus(
      submission
        ? {
            submitted_at: submission.submitted_at,
            grading_status: submission.grading_status as GradingStatus,
          }
        : null,
    )
    return { exam, submission, status }
  })

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-10 pt-28 pb-20 md:pt-32">
        <PageHeader
          eyebrow="EXAM"
          title="시험"
          description="주차별 시험에 응시하고 채점 결과와 이의제기 토론을 확인하세요."
          actions={
            profile.role === "admin" ? (
              <Button asChild>
                <Link href="/exams/new">시험 만들기</Link>
              </Button>
            ) : undefined
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            title="등록된 시험이 없습니다"
            description={
              profile.role === "admin"
                ? "시험 만들기 버튼으로 첫 시험을 등록해 보세요."
                : "관리자가 시험을 등록하면 이곳에 표시됩니다."
            }
          />
        ) : (
          /* 희소한 목록은 표보다 카드 리스트가 낫다 — 주차 배지 + 제목/제한시간,
             우측에 상태와 행 동작을 모아 시선 흐름을 왼→오 하나로 정리. */
          <div className="flex flex-col gap-3">
            {rows.map(({ exam, status }) => (
              <div
                key={exam.id}
                className="flex items-center justify-between gap-6 rounded-xl border border-border bg-card px-6 py-5 transition-colors hover:border-primary/40"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-bold text-primary">
                    {exam.week_number}주
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-base font-medium text-foreground">
                      {exam.title}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      제한시간 {exam.time_limit_minutes}분
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <ExamStatusBadge status={status} className="h-7 px-3.5 text-sm" />
                  {/* 화면당 primary(violet) 버튼은 1개 규칙 — 행 단위 반복 액션은
                      모두 outline으로, "시험 만들기"(admin, 페이지 헤더)만 primary. */}
                  {status === "not_started" ? (
                    <Button asChild variant="outline">
                      <Link href={`/exams/${exam.id}/take`}>응시하기</Link>
                    </Button>
                  ) : status === "in_progress" ? (
                    <Button asChild variant="outline">
                      <Link href={`/exams/${exam.id}/take`}>이어서 응시</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="outline">
                      <Link href={`/exams/${exam.id}`}>결과 보기</Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </main>
  )
}
