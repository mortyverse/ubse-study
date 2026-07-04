import type { GradingStatus } from "@/lib/types"

/** 시험 목록에서 쓰는 본인 응시 상태 (PRD §4.2) */
export type ExamViewStatus =
  | "not_started"
  | "in_progress"
  | "grading"
  | "failed"
  | "completed"

export const EXAM_STATUS_LABEL: Record<ExamViewStatus, string> = {
  not_started: "미응시",
  in_progress: "응시 중",
  grading: "채점 중",
  failed: "채점 실패",
  completed: "완료",
}

/** submitted_at/grading_status 유무로 본인 응시 상태를 도출한다 (서버/클라 공용 순수 함수). */
export function deriveExamStatus(
  submission: { submitted_at: string | null; grading_status: GradingStatus } | null,
): ExamViewStatus {
  if (!submission) return "not_started"
  if (!submission.submitted_at) return "in_progress"
  if (submission.grading_status === "failed") return "failed"
  if (submission.grading_status === "completed") return "completed"
  return "grading"
}
