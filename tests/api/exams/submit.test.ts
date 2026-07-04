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

function req(body: unknown) {
  return new Request("http://localhost/api/exams/exam-1/submit", {
    method: "POST",
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
    started_at: "2026-01-01T12:00:00.000Z", // deadline = 12:30
    submitted_at: null,
    grading_status: "pending",
    ...overrides,
  };
}

describe("POST /api/exams/[id]/submit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    afterCallbacks.length = 0;
    requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 for an unknown exam", async () => {
    const supa = createSupabaseMock({ exams: { select: { data: null, error: null } } });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/submit/route");

    const res = await POST(req({ answers: [] }), params());

    expect(res.status).toBe(404);
  });

  it("returns 409 '이미 제출된 시험입니다.' on double submit", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_submissions: {
        select: { data: submission({ submitted_at: "2026-01-01T12:05:00.000Z" }), error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/submit/route");

    const res = await POST(req({ answers: [] }), params());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("이미 제출된 시험입니다.");
  });

  it("within the grace window past the deadline: saves the enclosed answers AND finalizes, capping submitted_at at the deadline", async () => {
    // deadline is 12:30; grace is 15s; now is 5s past deadline (within grace)
    vi.setSystemTime(new Date("2026-01-01T12:30:05.000Z"));
    const finalizedRow = submission({ submitted_at: "2026-01-01T12:30:00.000Z" });
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_submissions: {
        select: { data: submission(), error: null },
        update: { data: finalizedRow, error: null },
      },
      exam_answers: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/submit/route");

    const res = await POST(
      req({ answers: [{ question_id: "q-1", answer_text: "last second answer" }] }),
      params(),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.submission.submitted_at).toBe("2026-01-01T12:30:00.000Z");
    // the enclosed answer WAS saved (within grace)
    expect(supa.chainsByTable.exam_answers).toHaveLength(1);
    expect(supa.chainsByTable.exam_answers[0].__calls[0]).toEqual({
      method: "update",
      args: [{ answer_text: "last second answer" }],
    });
    // submitted_at capped at the deadline, never the client-supplied "now"
    const submissionUpdateChain = supa.chainsByTable.exam_submissions.find((c) =>
      c.__calls.some((cc) => cc.method === "update"),
    )!;
    const payload = submissionUpdateChain.__calls.find((c) => c.method === "update")!
      .args[0] as { submitted_at: string };
    expect(payload.submitted_at).toBe("2026-01-01T12:30:00.000Z");
  });

  it("beyond the grace window: the enclosed answers are NOT saved, but the submission still finalizes (capped at deadline)", async () => {
    // 20s past the 30-min deadline — beyond the 15s grace
    vi.setSystemTime(new Date("2026-01-01T12:30:20.000Z"));
    const finalizedRow = submission({ submitted_at: "2026-01-01T12:30:00.000Z" });
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_submissions: {
        select: { data: submission(), error: null },
        update: { data: finalizedRow, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/submit/route");

    const res = await POST(
      req({ answers: [{ question_id: "q-1", answer_text: "too late to save" }] }),
      params(),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.submission.submitted_at).toBe("2026-01-01T12:30:00.000Z");
    // no exam_answers table touched at all — the enclosed answer was dropped
    expect(supa.chainsByTable.exam_answers ?? []).toHaveLength(0);
  });

  it("triggers background grading (after()) on a successful submit", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const finalizedRow = submission({ submitted_at: "2026-01-01T12:10:00.000Z" });
    const supa = createSupabaseMock({
      exams: { select: { data: EXAM, error: null } },
      exam_submissions: {
        select: { data: submission(), error: null },
        update: { data: finalizedRow, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/[id]/submit/route");

    await POST(req({ answers: [] }), params());

    expect(afterCallbacks).toHaveLength(1);
  });
});
