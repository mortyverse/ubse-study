import { describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../helpers/supabase-mock";

const { createAdminClientMock, gradeAnswerMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  gradeAnswerMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("@/lib/gemini", () => ({
  gradeAnswer: gradeAnswerMock,
}));

describe("gradeSubmission", () => {
  it("claims the submission only when grading_status is pending/failed AND submitted_at is not null, via a conditional update", async () => {
    const supa = createSupabaseMock({
      exam_submissions: {
        update: [
          { data: { id: "sub-1" }, error: null }, // claim succeeds
          { data: null, error: null }, // completed update
        ],
      },
      exam_answers: { select: { data: [], error: null } },
      exam_questions: { select: { data: [], error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { gradeSubmission } = await import("@/lib/grading");

    await gradeSubmission("sub-1");

    const [claimChain] = supa.chainsByTable.exam_submissions;
    expect(claimChain.__calls[0]).toEqual({
      method: "update",
      args: [{ grading_status: "grading" }],
    });
    expect(claimChain.__calls).toContainEqual({
      method: "in",
      args: ["grading_status", ["pending", "failed"]],
    });
    expect(claimChain.__calls).toContainEqual({
      method: "not",
      args: ["submitted_at", "is", null],
    });
  });

  it("skips grading entirely (no answers/questions/gemini calls) when the claim fails — e.g. already grading/completed, or not yet submitted", async () => {
    const supa = createSupabaseMock({
      exam_submissions: {
        update: { data: null, error: null }, // conditional update matched nothing
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { gradeSubmission } = await import("@/lib/grading");

    await gradeSubmission("sub-1");

    expect(supa.chainsByTable.exam_answers ?? []).toHaveLength(0);
    expect(supa.chainsByTable.exam_questions ?? []).toHaveLength(0);
    expect(gradeAnswerMock).not.toHaveBeenCalled();
  });

  it("writes ai draft + auto-confirms final_score for unconfirmed answers, but preserves an existing admin final_score", async () => {
    gradeAnswerMock.mockImplementation(async ({ maxScore }: { maxScore: number }) => ({
      score: maxScore, // AI가 만점을 준 상황 — 자동 확정 시 final_score = ai_score
      rationale: "근거",
    }));
    const supa = createSupabaseMock({
      exam_submissions: {
        update: [
          { data: { id: "sub-1" }, error: null },
          { data: null, error: null },
        ],
      },
      exam_answers: {
        select: {
          data: [
            // 미확정 → 자동 확정 대상
            { id: "ans-1", question_id: "q-1", answer_text: "답1", final_score: null },
            // 관리자가 이미 확정(재채점 경로) → final_score 보존
            { id: "ans-2", question_id: "q-2", answer_text: "답2", final_score: 5 },
          ],
          error: null,
        },
        update: { data: null, error: null },
      },
      exam_questions: {
        select: {
          data: [
            { id: "q-1", question_text: "문제1", max_score: 10 },
            { id: "q-2", question_text: "문제2", max_score: 20 },
          ],
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { gradeSubmission } = await import("@/lib/grading");

    await gradeSubmission("sub-1");

    expect(gradeAnswerMock).toHaveBeenCalledTimes(2);
    expect(gradeAnswerMock).toHaveBeenCalledWith({
      questionText: "문제1",
      maxScore: 10,
      answerText: "답1",
    });
    expect(gradeAnswerMock).toHaveBeenCalledWith({
      questionText: "문제2",
      maxScore: 20,
      answerText: "답2",
    });

    const payloadFor = (answerId: string) => {
      const chain = supa.chainsByTable.exam_answers.find(
        (c) =>
          c.__calls.some((cc) => cc.method === "update") &&
          c.__calls.some(
            (cc) => cc.method === "eq" && cc.args[0] === "id" && cc.args[1] === answerId,
          ),
      );
      return chain?.__calls.find((c) => c.method === "update")?.args[0] as Record<
        string,
        unknown
      >;
    };

    // 미확정 답안: AI 초안 + 자동 확정 (final_score = ai_score)
    expect(payloadFor("ans-1")).toEqual({
      ai_score: 10,
      ai_rationale: "근거",
      final_score: 10,
    });
    // 관리자 확정 답안: AI 초안만 갱신, final_score는 건드리지 않는다
    expect(payloadFor("ans-2")).toEqual({ ai_score: 20, ai_rationale: "근거" });

    // final update transitions grading_status to completed
    const submissionUpdates = supa.chainsByTable.exam_submissions.map(
      (c) => c.__calls.find((cc) => cc.method === "update")?.args[0],
    );
    expect(submissionUpdates).toContainEqual({ grading_status: "completed" });
  });

  it("sets grading_status='failed' when gradeAnswer throws for any answer", async () => {
    gradeAnswerMock.mockRejectedValueOnce(new Error("gemini boom"));
    const supa = createSupabaseMock({
      exam_submissions: {
        update: [
          { data: { id: "sub-1" }, error: null },
          { data: null, error: null }, // failed update
        ],
      },
      exam_answers: {
        select: {
          data: [{ id: "ans-1", question_id: "q-1", answer_text: "답1" }],
          error: null,
        },
      },
      exam_questions: {
        select: {
          data: [{ id: "q-1", question_text: "문제1", max_score: 10 }],
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { gradeSubmission } = await import("@/lib/grading");

    await gradeSubmission("sub-1");

    const submissionUpdates = supa.chainsByTable.exam_submissions.map(
      (c) => c.__calls.find((cc) => cc.method === "update")?.args[0],
    );
    expect(submissionUpdates).toContainEqual({ grading_status: "failed" });
  });
});
