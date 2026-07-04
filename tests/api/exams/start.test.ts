import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AppUser } from "@/lib/types";
import { createSupabaseMock } from "../../helpers/supabase-mock";

const { requireApprovedMock, createAdminClientMock, afterCallbacks } = vi.hoisted(() => ({
  requireApprovedMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/auth", () => ({
  requireApproved: requireApprovedMock,
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb);
    },
  };
});

function memberProfile(): AppUser {
  return {
    id: "member-1",
    github_id: "gh-1",
    github_username: "octocat",
    display_name: "Octo Cat",
    avatar_url: null,
    role: "member",
    status: "approved",
    approved_by: null,
    approved_at: null,
    github_url: null,
    project_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function req() {
  return new Request("http://localhost/api/exams/exam-1/start", { method: "POST" });
}
function params(id = "exam-1") {
  return { params: Promise.resolve({ id }) };
}

const EXAM = {
  id: "exam-1",
  title: "1주차 시험",
  week_number: 1,
  time_limit_minutes: 30,
  created_by: "admin-1",
};
const QUESTIONS = [
  { id: "q-1", exam_id: "exam-1", question_text: "문제1", max_score: 10, order: 1 },
  { id: "q-2", exam_id: "exam-1", question_text: "문제2", max_score: 20, order: 2 },
];

describe("POST /api/exams/[id]/start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    afterCallbacks.length = 0;
    requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a pending/unapproved caller by passing through the requireApproved error", async () => {
    requireApprovedMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 403 }),
    });
    const { POST } = await import("@/app/api/exams/[id]/start/route");

    const res = await POST(req(), params());

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown exam", async () => {
    const supa = createSupabaseMock({
      exams: { select: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/start/route");

    const res = await POST(req(), params("no-such-exam"));

    expect(res.status).toBe(404);
  });

  it("returns 409 for an exam that has no questions", async () => {
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_questions: { select: { data: [], error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/start/route");

    const res = await POST(req(), params());

    expect(res.status).toBe(409);
  });

  it("creates a submission and seeds an empty answer row for every question", async () => {
    const submissionRow = {
      id: "sub-1",
      exam_id: "exam-1",
      user_id: "member-1",
      started_at: "2026-01-01T12:00:00.000Z",
      submitted_at: null,
      grading_status: "pending",
    };
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_questions: { select: { data: QUESTIONS, error: null } },
      exam_submissions: {
        select: { data: null, error: null }, // no existing submission
        insert: { data: submissionRow, error: null },
      },
      exam_answers: {
        insert: { data: null, error: null },
        select: { data: [], error: null }, // final re-fetch of answers for response
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/start/route");

    const res = await POST(req(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.submission).toEqual(submissionRow);

    const [answersInsertChain] = supa.chainsByTable.exam_answers;
    const seeded = answersInsertChain.__calls[0].args[0] as Array<{
      submission_id: string;
      question_id: string;
    }>;
    expect(seeded).toEqual([
      { submission_id: "sub-1", question_id: "q-1" },
      { submission_id: "sub-1", question_id: "q-2" },
    ]);
  });

  it("rolls back the submission and returns 500 when seeding answer rows fails", async () => {
    const submissionRow = {
      id: "sub-doomed",
      exam_id: "exam-1",
      user_id: "member-1",
      started_at: "2026-01-01T12:00:00.000Z",
      submitted_at: null,
      grading_status: "pending",
    };
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_questions: { select: { data: QUESTIONS, error: null } },
      exam_submissions: {
        select: { data: null, error: null },
        insert: { data: submissionRow, error: null },
        delete: { data: null, error: null },
      },
      exam_answers: {
        insert: { data: null, error: { message: "seed failed" } },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/start/route");

    const res = await POST(req(), params());

    expect(res.status).toBe(500);
    const deleteChain = supa.chainsByTable.exam_submissions.find((c) =>
      c.__calls.some((cc) => cc.method === "delete"),
    );
    expect(deleteChain).toBeDefined();
    expect(deleteChain!.__calls).toContainEqual({
      method: "eq",
      args: ["id", "sub-doomed"],
    });
  });

  it("is idempotent: returns the existing submission and does NOT insert a duplicate submission or answer rows", async () => {
    const existingSubmission = {
      id: "sub-existing",
      exam_id: "exam-1",
      user_id: "member-1",
      started_at: "2026-01-01T11:50:00.000Z",
      submitted_at: null,
      grading_status: "pending",
    };
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_questions: { select: { data: QUESTIONS, error: null } },
      exam_submissions: {
        select: { data: existingSubmission, error: null },
      },
      exam_answers: {
        select: { data: [], error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/start/route");

    const res = await POST(req(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.submission).toEqual(existingSubmission);
    // no insert calls at all against exam_submissions / exam_answers
    expect(
      supa.chainsByTable.exam_submissions.some((c) =>
        c.__calls.some((cc) => cc.method === "insert"),
      ),
    ).toBe(false);
    expect(
      supa.chainsByTable.exam_answers.some((c) =>
        c.__calls.some((cc) => cc.method === "insert"),
      ),
    ).toBe(false);
  });
});
