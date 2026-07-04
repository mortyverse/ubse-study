import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AppUser } from "@/lib/types";
import { createSupabaseMock } from "../../helpers/supabase-mock";

const { requireApprovedMock, createAdminClientMock } = vi.hoisted(() => ({
  requireApprovedMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApproved: requireApprovedMock,
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

function memberProfile(id = "member-1"): AppUser {
  return {
    id,
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

function req() {
  return new Request("http://localhost/api/answers/ans-1/disputes", { method: "POST" });
}
function params(id = "ans-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/answers/[id]/disputes", () => {
  it("rejects an unapproved caller by passing through the requireApproved error", async () => {
    requireApprovedMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 403 }),
    });
    const { POST } = await import("@/app/api/answers/[id]/disputes/route");

    const res = await POST(req(), params());

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the answer does not exist", async () => {
    requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
    const supa = createSupabaseMock({
      exam_answers: { select: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/answers/[id]/disputes/route");

    const res = await POST(req(), params());

    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller does not own the submission the answer belongs to", async () => {
    requireApprovedMock.mockResolvedValue({ profile: memberProfile("member-1"), error: null });
    const supa = createSupabaseMock({
      exam_answers: {
        select: {
          data: {
            id: "ans-1",
            ai_score: 5,
            exam_submissions: { user_id: "someone-else", grading_status: "completed" },
          },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/answers/[id]/disputes/route");

    const res = await POST(req(), params());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("본인 답안에만 이의제기할 수 있습니다.");
  });

  it("returns 409 before grading is completed (grading_status !== 'completed')", async () => {
    requireApprovedMock.mockResolvedValue({ profile: memberProfile("member-1"), error: null });
    const supa = createSupabaseMock({
      exam_answers: {
        select: {
          data: {
            id: "ans-1",
            ai_score: null,
            exam_submissions: { user_id: "member-1", grading_status: "grading" },
          },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/answers/[id]/disputes/route");

    const res = await POST(req(), params());

    expect(res.status).toBe(409);
  });

  it("returns 409 when there is already an open dispute for this answer (no duplicates)", async () => {
    requireApprovedMock.mockResolvedValue({ profile: memberProfile("member-1"), error: null });
    const supa = createSupabaseMock({
      exam_answers: {
        select: {
          data: {
            id: "ans-1",
            ai_score: 5,
            exam_submissions: { user_id: "member-1", grading_status: "completed" },
          },
          error: null,
        },
      },
      exam_disputes: {
        select: { data: { id: "dispute-existing" }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/answers/[id]/disputes/route");

    const res = await POST(req(), params());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("이미 진행 중인 이의제기가 있습니다.");
  });

  it("creates the dispute when owned, completed, and no open dispute exists", async () => {
    requireApprovedMock.mockResolvedValue({ profile: memberProfile("member-1"), error: null });
    const supa = createSupabaseMock({
      exam_answers: {
        select: {
          data: {
            id: "ans-1",
            ai_score: 5,
            exam_submissions: { user_id: "member-1", grading_status: "completed" },
          },
          error: null,
        },
      },
      exam_disputes: {
        select: { data: null, error: null },
        insert: {
          data: { id: "dispute-new", answer_id: "ans-1", created_by: "member-1", status: "open" },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/answers/[id]/disputes/route");

    const res = await POST(req(), params());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.dispute.answer_id).toBe("ans-1");
    expect(body.dispute.created_by).toBe("member-1");
  });
});
