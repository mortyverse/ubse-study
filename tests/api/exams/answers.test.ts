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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/exams/exam-1/answers", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
function params(id = "exam-1") {
  return { params: Promise.resolve({ id }) };
}

const EXAM = { id: "exam-1", time_limit_minutes: 30 };

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    exam_id: "exam-1",
    user_id: "member-1",
    started_at: "2026-01-01T12:00:00.000Z",
    submitted_at: null,
    grading_status: "pending",
    ...overrides,
  };
}

describe("PUT /api/exams/[id]/answers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    afterCallbacks.length = 0;
    requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects an unapproved caller by passing through the requireApproved error", async () => {
    requireApprovedMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 403 }),
    });
    const { PUT } = await import("@/app/api/exams/[id]/answers/route");

    const res = await PUT(
      req({ answers: [{ question_id: "q-1", answer_text: "a" }] }),
      params(),
    );

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects an answer_text longer than 20,000 characters", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const { PUT } = await import("@/app/api/exams/[id]/answers/route");

    const res = await PUT(
      req({ answers: [{ question_id: "q-1", answer_text: "a".repeat(20_001) }] }),
      params(),
    );

    expect(res.status).toBe(400);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns 409 '이미 제출된 시험입니다.' when the submission is already finalized", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_submissions: {
        select: { data: submission({ submitted_at: "2026-01-01T12:05:00.000Z" }), error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PUT } = await import("@/app/api/exams/[id]/answers/route");

    const res = await PUT(
      req({ answers: [{ question_id: "q-1", answer_text: "a" }] }),
      params(),
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("이미 제출된 시험입니다.");
  });

  it("at/after the deadline, auto-submits (finalize capped at the deadline) instead of saving and returns 409", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:30:00.000Z")); // exactly at the 30-min deadline
    const finalizedRow = submission({ submitted_at: "2026-01-01T12:30:00.000Z" });
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_submissions: {
        select: { data: submission(), error: null },
        update: { data: finalizedRow, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PUT } = await import("@/app/api/exams/[id]/answers/route");

    const res = await PUT(
      req({ answers: [{ question_id: "q-1", answer_text: "too late" }] }),
      params(),
    );

    expect(res.status).toBe(409);
    const updateChain = supa.chainsByTable.exam_submissions.find((c) =>
      c.__calls.some((cc) => cc.method === "update"),
    )!;
    const payload = updateChain.__calls.find((c) => c.method === "update")!
      .args[0] as { submitted_at: string };
    expect(payload.submitted_at).toBe("2026-01-01T12:30:00.000Z"); // capped at deadline
  });

  it("before the deadline, updates only the rows scoped to (submission_id, question_id)", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_submissions: {
        select: { data: submission(), error: null },
      },
      exam_answers: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PUT } = await import("@/app/api/exams/[id]/answers/route");

    const res = await PUT(
      req({
        answers: [
          { question_id: "q-1", answer_text: "답1" },
          { question_id: "q-2", answer_text: "답2" },
        ],
      }),
      params(),
    );

    expect(res.status).toBe(200);
    expect(supa.chainsByTable.exam_answers).toHaveLength(2);
    const [chain1, chain2] = supa.chainsByTable.exam_answers;
    expect(chain1.__calls[0]).toEqual({
      method: "update",
      args: [{ answer_text: "답1" }],
    });
    expect(chain1.__calls).toContainEqual({ method: "eq", args: ["submission_id", "sub-1"] });
    expect(chain1.__calls).toContainEqual({ method: "eq", args: ["question_id", "q-1"] });
    expect(chain2.__calls).toContainEqual({ method: "eq", args: ["question_id", "q-2"] });
  });
});
