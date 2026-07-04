import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeAnswer } from "@/lib/gemini";
import type { ExamAnswer, ExamQuestion } from "@/lib/types";

/**
 * 제출 1건의 전체 문항을 Gemini로 1차 채점한다 (비동기 백그라운드 잡).
 * grading_status: grading → completed | failed. ai_score/ai_rationale는
 * 초안일 뿐이며 final_score에는 절대 손대지 않는다 (PRD §4.2 #6).
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
      .select("id, question_id, answer_text")
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
      "id" | "question_id" | "answer_text"
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
        .update({ ai_score: grade.score, ai_rationale: grade.rationale })
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
