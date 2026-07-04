import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoSubmitIfExpired, deadlineOf } from "@/lib/exams";
import type { Exam, ExamSubmission } from "@/lib/types";

/**
 * 응시 시작 (승인 멤버): started_at을 서버가 기록한다 (PRD §4.2).
 * 이미 시작한 경우 기존 submission을 그대로 반환한다 (재응시 불가,
 * unique(exam_id,user_id)). 시작과 동시에 전 문항의 빈 답안 행을 만들어
 * 자동 저장/채점 대상 행을 고정한다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id: examId } = await params;
  const admin = createAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("*")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: questions, error: questionsError } = await admin
    .from("exam_questions")
    .select("id, exam_id, question_text, max_score, order")
    .eq("exam_id", examId)
    .order("order", { ascending: true });
  if (questionsError || !questions || questions.length === 0) {
    return NextResponse.json(
      { error: "문제가 없는 시험입니다. 관리자에게 문의하세요." },
      { status: 409 },
    );
  }

  // 기존 submission이 있으면 그대로 사용 (마감 지났으면 자동 제출 처리)
  const { data: existing } = await admin
    .from("exam_submissions")
    .select("*")
    .eq("exam_id", examId)
    .eq("user_id", profile.id)
    .maybeSingle();

  let submission = existing as ExamSubmission | null;

  if (!submission) {
    const { data: created, error: createError } = await admin
      .from("exam_submissions")
      .insert({ exam_id: examId, user_id: profile.id })
      .select("*")
      .single();
    if (createError || !created) {
      return NextResponse.json(
        { error: "응시 시작에 실패했습니다. 다시 시도해 주세요." },
        { status: 500 },
      );
    }
    submission = created as ExamSubmission;

    const { error: seedError } = await admin.from("exam_answers").insert(
      questions.map((q) => ({
        submission_id: submission!.id,
        question_id: q.id,
      })),
    );
    if (seedError) {
      await admin.from("exam_submissions").delete().eq("id", submission.id);
      return NextResponse.json(
        { error: "답안지 생성에 실패해 응시를 취소했습니다. 다시 시도해 주세요." },
        { status: 500 },
      );
    }
  } else {
    submission = await autoSubmitIfExpired(submission, exam as Exam);
  }

  const { data: answers } = await admin
    .from("exam_answers")
    .select("id, question_id, answer_text")
    .eq("submission_id", submission.id);

  return NextResponse.json({
    exam,
    questions,
    submission,
    answers: answers ?? [],
    deadline: deadlineOf(submission, exam as Exam).toISOString(),
    serverNow: new Date().toISOString(),
  });
}
