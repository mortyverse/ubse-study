import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AppUser } from "@/lib/types";
import { createSupabaseMock } from "../../helpers/supabase-mock";

const { requireAdminMock, createAdminClientMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: requireAdminMock,
  requireApproved: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

function adminProfile(): AppUser {
  return {
    id: "admin-1",
    github_id: "gh-admin",
    github_username: "admin",
    display_name: "Admin",
    avatar_url: null,
    role: "admin",
    status: "approved",
    approved_by: null,
    approved_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/answers/ans-1/final", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
function params(id = "ans-1") {
  return { params: Promise.resolve({ id }) };
}

const ANSWER_MAX_10 = { id: "ans-1", exam_questions: { max_score: 10 } };

describe("PATCH /api/answers/[id]/final", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a non-admin caller by passing through the requireAdmin error", async () => {
    requireAdminMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    });
    const { PATCH } = await import("@/app/api/answers/[id]/final/route");

    const res = await PATCH(req({ final_score: 5 }), params());

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([-1, "5", null, undefined, NaN])(
    "rejects an invalid final_score %p with 400 before touching the DB",
    async (finalScore) => {
      const { PATCH } = await import("@/app/api/answers/[id]/final/route");

      const res = await PATCH(req({ final_score: finalScore }), params());

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a final_score greater than the question's max_score (배점)", async () => {
    const supa = createSupabaseMock({
      exam_answers: { select: { data: ANSWER_MAX_10, error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/answers/[id]/final/route");

    const res = await PATCH(req({ final_score: 11 }), params());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("배점");
  });

  it("returns 404 when the answer does not exist", async () => {
    const supa = createSupabaseMock({
      exam_answers: { select: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/answers/[id]/final/route");

    const res = await PATCH(req({ final_score: 5 }), params());

    expect(res.status).toBe(404);
  });

  it("sets final_score, resolved_by (calling admin), and resolved_at (server time) on success", async () => {
    const supa = createSupabaseMock({
      exam_answers: {
        select: { data: ANSWER_MAX_10, error: null },
        update: {
          data: {
            id: "ans-1",
            final_score: 8,
            resolved_by: "admin-1",
            resolved_at: "2026-01-01T12:00:00.000Z",
          },
          error: null,
        },
      },
      exam_disputes: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/answers/[id]/final/route");

    const res = await PATCH(req({ final_score: 8 }), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.answer.final_score).toBe(8);
    expect(body.answer.resolved_by).toBe("admin-1");
    expect(body.answer.resolved_at).toBe("2026-01-01T12:00:00.000Z");

    const [updateChain] = supa.chainsByTable.exam_answers.filter((c) =>
      c.__calls.some((cc) => cc.method === "update"),
    );
    const payload = updateChain.__calls.find((c) => c.method === "update")!.args[0] as Record<
      string,
      unknown
    >;
    expect(payload.final_score).toBe(8);
    expect(payload.resolved_by).toBe("admin-1");
    expect(payload.resolved_at).toBe("2026-01-01T12:00:00.000Z");
  });

  it("resolves any open dispute for this answer (update scoped to answer_id + status='open')", async () => {
    const supa = createSupabaseMock({
      exam_answers: {
        select: { data: ANSWER_MAX_10, error: null },
        update: {
          data: { id: "ans-1", final_score: 8, resolved_by: "admin-1", resolved_at: "x" },
          error: null,
        },
      },
      exam_disputes: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/answers/[id]/final/route");

    await PATCH(req({ final_score: 8 }), params());

    const [disputesChain] = supa.chainsByTable.exam_disputes;
    expect(disputesChain.__calls[0]).toEqual({
      method: "update",
      args: [{ status: "resolved" }],
    });
    expect(disputesChain.__calls).toContainEqual({
      method: "eq",
      args: ["answer_id", "ans-1"],
    });
    expect(disputesChain.__calls).toContainEqual({ method: "eq", args: ["status", "open"] });
  });

  it("allows re-confirming with a different score (bidirectional correct<->incorrect flip)", async () => {
    const supa = createSupabaseMock({
      exam_answers: {
        select: { data: ANSWER_MAX_10, error: null },
        update: {
          data: { id: "ans-1", final_score: 2, resolved_by: "admin-1", resolved_at: "y" },
          error: null,
        },
      },
      exam_disputes: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/answers/[id]/final/route");

    // second PATCH with a different score than a previous confirmation
    const res = await PATCH(req({ final_score: 2 }), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.answer.final_score).toBe(2);
  });
});
