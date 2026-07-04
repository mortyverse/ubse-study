import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoSubmitIfExpired, deadlineOf } from "@/lib/exams";
import type { Exam, ExamSubmission } from "@/lib/types";

const MAX_ANSWER_LENGTH = 20_000;

/**
 * 답안 자동 저장 (승인 멤버, 본인 submission, 마감 전만).
 * 서버 시간으로 마감을 판정한다 — 마감 후 저장 시도는 거부되고
 * 저장돼 있던 답안 그대로 자동 제출된다 (PRD §4.2).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id: examId } = await params;
  const body = (await request.json().catch(() => null)) as {
    answers?: unknown;
  } | null;

  if (!Array.isArray(body?.answers) || body.answers.length === 0) {
    return NextResponse.json({ error: "answers 배열이 필요합니다." }, { status: 400 });
  }
  const answers: Array<{ question_id: string; answer_text: string }> = [];
  for (const a of body.answers as Array<Record<string, unknown>>) {
    if (
      typeof a?.question_id !== "string" ||
      typeof a?.answer_text !== "string" ||
      a.answer_text.length > MAX_ANSWER_LENGTH
    ) {
      return NextResponse.json(
        { error: `answers 형식이 올바르지 않습니다. (답안 ${MAX_ANSWER_LENGTH}자 이내)` },
        { status: 400 },
      );
    }
    answers.push({ question_id: a.question_id, answer_text: a.answer_text });
  }

  const admin = createAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("*")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: submissionRow } = await admin
    .from("exam_submissions")
    .select("*")
    .eq("exam_id", examId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!submissionRow) {
    return NextResponse.json({ error: "응시 중인 시험이 아닙니다." }, { status: 404 });
  }

  let submission = submissionRow as ExamSubmission;
  if (submission.submitted_at) {
    return NextResponse.json({ error: "이미 제출된 시험입니다." }, { status: 409 });
  }

  const deadline = deadlineOf(submission, exam as Exam);
  if (Date.now() >= deadline.getTime()) {
    submission = await autoSubmitIfExpired(submission, exam as Exam);
    return NextResponse.json(
      { error: "제한시간이 종료되어 자동 제출되었습니다.", submission },
      { status: 409 },
    );
  }

  // 본인 답안지 행만 갱신 (start 때 시딩된 행 — insert 아님)
  for (const a of answers) {
    const { error: writeError } = await admin
      .from("exam_answers")
      .update({ answer_text: a.answer_text })
      .eq("submission_id", submission.id)
      .eq("question_id", a.question_id);
    if (writeError) {
      return NextResponse.json({ error: "답안 저장에 실패했습니다." }, { status: 500 });
    }
  }

  return NextResponse.json({
    saved: answers.length,
    deadline: deadline.toISOString(),
    serverNow: new Date().toISOString(),
  });
}
