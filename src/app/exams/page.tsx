import Link from "next/link"
import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>주차</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>제한시간</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">동작</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ exam, status }) => (
                  <TableRow key={exam.id} className="hover:bg-accent/40">
                    <TableCell className="text-muted-foreground">
                      {exam.week_number}주차
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {exam.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {exam.time_limit_minutes}분
                    </TableCell>
                    <TableCell>
                      <ExamStatusBadge status={status} />
                    </TableCell>
                    <TableCell>
                      {/* 화면당 primary(violet) 버튼은 1개 규칙 — 행 단위 반복 액션은
                          모두 outline으로, "시험 만들기"(admin, 페이지 헤더)만 primary. */}
                      <div className="flex justify-end">
                        {status === "not_started" ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/exams/${exam.id}/take`}>응시하기</Link>
                          </Button>
                        ) : status === "in_progress" ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/exams/${exam.id}/take`}>이어서 응시</Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/exams/${exam.id}`}>결과 보기</Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Container>
    </main>
  )
}
