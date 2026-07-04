import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { OwnResult } from "@/components/exams/own-result"
import { DisputeDiscussion } from "@/components/exams/dispute-discussion"
import { AdminGradingPanel } from "@/components/exams/admin-grading-panel"
import type {
  AdminSubmissionView,
  DisputeAnswerOwner,
  DisputeView,
  MyResultView,
} from "@/components/exams/detail-types"
import type { GradingStatus } from "@/lib/types"

type RawAnswerEmbed = {
  id: string
  question_id: string
  answer_text: string | null
  ai_score: number | null
  ai_rationale: string | null
  final_score: number | null
  resolved_at: string | null
  exam_submissions: { exam_id: string; user_id: string; users: DisputeAnswerOwner | null } | null
  exam_questions: { question_text: string; max_score: number; order: number } | null
} | null

type RawDispute = {
  id: string
  status: "open" | "resolved"
  created_at: string
  exam_answers: RawAnswerEmbed
}

type RawComment = {
  id: string
  dispute_id: string
  content: string
  created_at: string
  users: DisputeAnswerOwner | null
}

export default async function ExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const { id: examId } = await params
  const supabase = await createClient()

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, week_number, time_limit_minutes")
    .eq("id", examId)
    .maybeSingle()

  if (!exam) notFound()

  const { data: mySubmission } = await supabase
    .from("exam_submissions")
    .select("id, submitted_at, grading_status")
    .eq("exam_id", examId)
    .eq("user_id", profile.id)
    .maybeSingle()

  let myResult: MyResultView | null = null

  if (mySubmission) {
    const [{ data: questions }, { data: myAnswers }] = await Promise.all([
      supabase
        .from("exam_questions")
        .select("id, question_text, max_score, order")
        .eq("exam_id", examId)
        .order("order", { ascending: true }),
      supabase
        .from("exam_answers")
        .select("id, question_id, answer_text, ai_score, ai_rationale, final_score, resolved_at")
        .eq("submission_id", mySubmission.id),
    ])

    const answerIds = (myAnswers ?? []).map((a) => a.id)
    const { data: myOpenDisputes } =
      answerIds.length > 0
        ? await supabase
            .from("exam_disputes")
            .select("answer_id")
            .in("answer_id", answerIds)
            .eq("status", "open")
        : { data: [] as { answer_id: string }[] }
    const openDisputeAnswerIds = new Set((myOpenDisputes ?? []).map((d) => d.answer_id))

    const questionById = new Map((questions ?? []).map((q) => [q.id, q]))

    myResult = {
      submission: {
        id: mySubmission.id,
        submitted_at: mySubmission.submitted_at,
        grading_status: mySubmission.grading_status as GradingStatus,
      },
      answers: (myAnswers ?? []).map((a) => {
        const q = questionById.get(a.question_id)
        return {
          id: a.id,
          question_id: a.question_id,
          question_text: q?.question_text ?? "",
          order: q?.order ?? 0,
          max_score: q?.max_score ?? 0,
          answer_text: a.answer_text,
          ai_score: a.ai_score,
          ai_rationale: a.ai_rationale,
          final_score: a.final_score,
          resolved_at: a.resolved_at,
          hasOpenDispute: openDisputeAnswerIds.has(a.id),
        }
      }),
    }
  }

  // 이의제기 토론: PRD §4.2 step 4 — 이의제기된 답안은 전체 승인 멤버가 보고
  // 토론한다. 세션 클라이언트로 임베드하면 exam_submissions의 own-row RLS 때문에
  // 타인 이의제기의 시험 소속/작성자가 null이 되어 목록에서 탈락하므로(감사 지적),
  // 여기서만 service-role로 조회한다. 안전 근거: (1) 페이지 상단에서 approved 검증
  // 완료, (2) 노출 범위는 "이의제기된 답안 + 그 문항 + 작성자 이름"으로, RLS의
  // exam_answers_select_disputed 의도적 공개 설계와 동일하다.
  const admin = createAdminClient()
  const { data: rawDisputes } = await admin
    .from("exam_disputes")
    .select(
      "id, status, created_at, exam_answers!inner(id, question_id, answer_text, ai_score, ai_rationale, final_score, resolved_at, exam_submissions!inner(exam_id, user_id, users(display_name, avatar_url)), exam_questions(question_text, max_score, order))",
    )
    .eq("exam_answers.exam_submissions.exam_id", examId)
    .order("created_at", { ascending: false })

  const examDisputesRaw = (
    (rawDisputes ?? []) as unknown as RawDispute[]
  ).filter((d) => d.exam_answers?.exam_submissions?.exam_id === examId)

  const disputeIds = examDisputesRaw.map((d) => d.id)
  const { data: rawComments } =
    disputeIds.length > 0
      ? await supabase
          .from("exam_dispute_comments")
          .select("id, dispute_id, content, created_at, users(display_name, avatar_url)")
          .in("dispute_id", disputeIds)
          .order("created_at", { ascending: true })
      : { data: [] as RawComment[] }

  const commentsByDispute = new Map<string, RawComment[]>()
  for (const c of (rawComments ?? []) as unknown as RawComment[]) {
    const list = commentsByDispute.get(c.dispute_id) ?? []
    list.push(c)
    commentsByDispute.set(c.dispute_id, list)
  }

  const disputes: DisputeView[] = examDisputesRaw
    .filter((d): d is RawDispute & { exam_answers: NonNullable<RawAnswerEmbed> } =>
      Boolean(d.exam_answers),
    )
    .map((d) => ({
      id: d.id,
      status: d.status,
      created_at: d.created_at,
      answer: {
        id: d.exam_answers.id,
        question_text: d.exam_answers.exam_questions?.question_text ?? null,
        max_score: d.exam_answers.exam_questions?.max_score ?? null,
        answer_text: d.exam_answers.answer_text,
        ai_score: d.exam_answers.ai_score,
        ai_rationale: d.exam_answers.ai_rationale,
        final_score: d.exam_answers.final_score,
        resolved_at: d.exam_answers.resolved_at,
        owner: d.exam_answers.exam_submissions?.users ?? {
          display_name: "알 수 없음",
          avatar_url: null,
        },
      },
      comments: (commentsByDispute.get(d.id) ?? []).map((c) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        author: c.users ?? { display_name: "알 수 없음", avatar_url: null },
      })),
    }))

  // 자동 확정 체제: 관리자 확정 UI는 열린 이의제기가 있는 답안에만 노출된다
  const openDisputeAnswerIdsAll = new Set(
    examDisputesRaw
      .filter((d) => d.status === "open")
      .map((d) => d.exam_answers?.id)
      .filter(Boolean),
  )

  let adminSubmissions: AdminSubmissionView[] = []
  if (profile.role === "admin") {
    const { data: allSubmissions } = await supabase
      .from("exam_submissions")
      .select(
        "id, submitted_at, grading_status, users(display_name, avatar_url), exam_answers(id, question_id, answer_text, ai_score, ai_rationale, final_score, resolved_at, exam_questions(question_text, max_score, order))",
      )
      .eq("exam_id", examId)
      .order("created_at", { ascending: true })

    type RawAdminSubmission = {
      id: string
      submitted_at: string | null
      grading_status: GradingStatus
      users: DisputeAnswerOwner | null
      exam_answers: Array<{
        id: string
        question_id: string
        answer_text: string | null
        ai_score: number | null
        ai_rationale: string | null
        final_score: number | null
        resolved_at: string | null
        exam_questions: { question_text: string; max_score: number; order: number } | null
      }> | null
    }

    adminSubmissions = ((allSubmissions ?? []) as unknown as RawAdminSubmission[]).map((s) => ({
      id: s.id,
      user: s.users ?? { display_name: "알 수 없음", avatar_url: null },
      submitted_at: s.submitted_at,
      grading_status: s.grading_status,
      answers: (s.exam_answers ?? []).map((a) => ({
        id: a.id,
        question_text: a.exam_questions?.question_text ?? "",
        order: a.exam_questions?.order ?? 0,
        max_score: a.exam_questions?.max_score ?? 0,
        answer_text: a.answer_text,
        ai_score: a.ai_score,
        ai_rationale: a.ai_rationale,
        final_score: a.final_score,
        resolved_at: a.resolved_at,
        hasOpenDispute: openDisputeAnswerIdsAll.has(a.id),
      })),
    }))
  }

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-12 pt-28 pb-20 md:pt-32">
        <PageHeader
          eyebrow={`EXAM · ${exam.week_number}주차`}
          title={exam.title}
          description={`제한시간 ${exam.time_limit_minutes}분`}
          actions={
            <Button asChild variant="outline">
              <Link href="/exams">목록으로</Link>
            </Button>
          }
        />

        {myResult && <OwnResult result={myResult} />}

        <DisputeDiscussion disputes={disputes} />

        {profile.role === "admin" && <AdminGradingPanel submissions={adminSubmissions} />}
      </Container>
    </main>
  )
}
