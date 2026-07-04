import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deadlineOf, finalizeSubmission } from "@/lib/exams";
import type { Exam, ExamSubmission } from "@/lib/types";

const MAX_ANSWER_LENGTH = 20_000;
/** 마감 직전 제출의 네트워크 지연 허용치 — 이 안에 도착한 답안까지만 반영 */
const SUBMIT_GRACE_MS = 15_000;

/**
 * 제출 (승인 멤버). 동봉된 최종 답안은 마감+유예 안에서만 저장되고,
 * submitted_at은 서버 시간(마감 초과 시 마감 시각으로 캡)으로 기록된다.
 * 제출 직후 Gemini 1차 채점이 백그라운드로 시작된다 → "채점 중" (PRD §4.2).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id: examId } = await params;
  const body = (await request.json().catch(() => null)) as {
    answers?: unknown;
  } | null;

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

  const submission = submissionRow as ExamSubmission;
  if (submission.submitted_at) {
    return NextResponse.json({ error: "이미 제출된 시험입니다." }, { status: 409 });
  }

  const deadline = deadlineOf(submission, exam as Exam);

  // 동봉된 최종 답안 반영 — 마감+유예 안에서만 (그 뒤엔 저장된 자동저장분으로 확정)
  if (Array.isArray(body?.answers) && Date.now() < deadline.getTime() + SUBMIT_GRACE_MS) {
    for (const a of body.answers as Array<Record<string, unknown>>) {
      if (
        typeof a?.question_id !== "string" ||
        typeof a?.answer_text !== "string" ||
        a.answer_text.length > MAX_ANSWER_LENGTH
      ) {
        continue;
      }
      await admin
        .from("exam_answers")
        .update({ answer_text: a.answer_text })
        .eq("submission_id", submission.id)
        .eq("question_id", a.question_id);
    }
  }

  const finalized = await finalizeSubmission(submission.id, deadline);
  if (!finalized) {
    return NextResponse.json({ error: "이미 제출된 시험입니다." }, { status: 409 });
  }

  return NextResponse.json({ submission: finalized });
}
