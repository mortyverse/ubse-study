import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeAnswer } from "@/lib/gemini";
import type { ExamAnswer, ExamQuestion } from "@/lib/types";

/**
 * 제출 1건의 전체 문항을 Gemini로 1차 채점한다 (비동기 백그라운드 잡).
 * grading_status: grading → completed | failed.
 *
 * 자동 확정 (owner 결정, 2026-07-05): AI 채점 결과는 기본적으로 그대로
 * 확정된다 — final_score = ai_score를 함께 기록한다 (resolved_by/resolved_at은
 * null = AI 자동확정 표식). 응시자가 이의제기하면 확정이 해제되고(final_score
 * null), 토론 후 관리자가 다시 확정한다. 관리자가 이미 확정한 답안
 * (final_score non-null)은 재채점 시에도 덮어쓰지 않는다.
 * 멱등: 이미 grading/completed인 제출은 건너뛴다 (중복 트리거 방지).
 */
export async function gradeSubmission(submissionId: string): Promise<void> {
  const admin = createAdminClient();

  // pending/failed 상태에서만 착수 (조건부 갱신으로 동시 트리거 경합 차단)
  const { data: claimed } = await admin
    .from("exam_submissions")
    .update({ grading_status: "grading" })
    .eq("id", submissionId)
    .in("grading_status", ["pending", "failed"])
    .not("submitted_at", "is", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  try {
    const { data: answers, error: answersError } = await admin
      .from("exam_answers")
      .select("id, question_id, answer_text, final_score")
      .eq("submission_id", submissionId);
    if (answersError) throw answersError;

    const { data: questions, error: questionsError } = await admin
      .from("exam_questions")
      .select("id, question_text, max_score")
      .in("id", (answers ?? []).map((a) => a.question_id));
    if (questionsError) throw questionsError;

    const questionById = new Map(
      (questions as Pick<ExamQuestion, "id" | "question_text" | "max_score">[]).map(
        (q) => [q.id, q],
      ),
    );

    // 정확도 우선(속도 무관) + 무료 티어 rate limit 고려 → 순차 채점
    for (const answer of (answers ?? []) as Pick<
      ExamAnswer,
      "id" | "question_id" | "answer_text" | "final_score"
    >[]) {
      const question = questionById.get(answer.question_id);
      if (!question) continue;
      const grade = await gradeAnswer({
        questionText: question.question_text,
        maxScore: question.max_score,
        answerText: answer.answer_text,
      });
      const { error: writeError } = await admin
        .from("exam_answers")
        .update({
          ai_score: grade.score,
          ai_rationale: grade.rationale,
          // 자동 확정 — 단, 관리자가 이미 확정해 둔 답안은 보존한다
          ...(answer.final_score === null ? { final_score: grade.score } : {}),
        })
        .eq("id", answer.id);
      if (writeError) throw writeError;
    }

    await admin
      .from("exam_submissions")
      .update({ grading_status: "completed" })
      .eq("id", submissionId);
  } catch (err) {
    console.error(`[grading] submission ${submissionId} failed:`, err);
    await admin
      .from("exam_submissions")
      .update({ grading_status: "failed" })
      .eq("id", submissionId);
  }
}
