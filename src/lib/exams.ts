import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeSubmission } from "@/lib/grading";
import type { Exam, ExamSubmission } from "@/lib/types";

/** 마감 시각 = started_at + 제한시간(분). 항상 서버 시간으로만 판정한다. */
export function deadlineOf(submission: ExamSubmission, exam: Exam): Date {
  return new Date(
    new Date(submission.started_at).getTime() +
      exam.time_limit_minutes * 60_000,
  );
}

/**
 * 제출 확정: submitted_at 기록(마감 초과분은 마감 시각으로 캡) + Gemini 채점을
 * 응답 후 백그라운드로 트리거. 미제출 상태에서만 전이 (동시 요청 방지).
 * 반환: 확정된 submission 또는 null(이미 제출됨/없음).
 */
export async function finalizeSubmission(
  submissionId: string,
  deadline: Date,
): Promise<ExamSubmission | null> {
  const admin = createAdminClient();
  const submittedAt = new Date(Math.min(Date.now(), deadline.getTime()));

  const { data: finalized } = await admin
    .from("exam_submissions")
    .update({ submitted_at: submittedAt.toISOString() })
    .eq("id", submissionId)
    .is("submitted_at", null)
    .select("*")
    .maybeSingle();

  if (!finalized) return null;

  // 채점은 비동기 — 응답을 보낸 뒤 실행 ("채점 중" → 완료 시 갱신, PRD §4.2)
  after(() => gradeSubmission(submissionId));
  return finalized as ExamSubmission;
}

/**
 * 제한시간 초과 자동 제출 (PRD §4.2) — 크론 없이 lazy 실행.
 * 마감이 지났는데 미제출인 submission을 발견한 API가 호출한다.
 * 저장된 답안(자동 저장분) 그대로 확정된다.
 */
export async function autoSubmitIfExpired(
  submission: ExamSubmission,
  exam: Exam,
): Promise<ExamSubmission> {
  if (submission.submitted_at) return submission;
  const deadline = deadlineOf(submission, exam);
  if (Date.now() < deadline.getTime()) return submission;
  const finalized = await finalizeSubmission(submission.id, deadline);
  return finalized ?? { ...submission, submitted_at: deadline.toISOString() };
}
