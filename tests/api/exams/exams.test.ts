import { describe, expect, it, vi } from "vitest";
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
  return new Request("http://localhost/api/exams", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  title: "1주차 시험",
  week_number: 1,
  time_limit_minutes: 30,
  questions: [{ question_text: "문제1", max_score: 10 }],
};

describe("POST /api/exams", () => {
  it("rejects a non-admin caller by passing through the requireAdmin error", async () => {
    requireAdminMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    });
    const { POST } = await import("@/app/api/exams/route");

    const res = await POST(req(VALID_BODY));

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  describe("field validation (admin authenticated)", () => {
    it("rejects week_number given as a numeric string (no coercion)", async () => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const { POST } = await import("@/app/api/exams/route");

      const res = await POST(req({ ...VALID_BODY, week_number: "3" }));

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it("rejects time_limit_minutes given as a numeric string (no coercion)", async () => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const { POST } = await import("@/app/api/exams/route");

      const res = await POST(req({ ...VALID_BODY, time_limit_minutes: "30" }));

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it("rejects an empty questions array", async () => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const { POST } = await import("@/app/api/exams/route");

      const res = await POST(req({ ...VALID_BODY, questions: [] }));

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it("rejects more than 50 questions", async () => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const { POST } = await import("@/app/api/exams/route");
      const questions = Array.from({ length: 51 }, (_, i) => ({
        question_text: `문제${i}`,
        max_score: 10,
      }));

      const res = await POST(req({ ...VALID_BODY, questions }));

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it("rejects a question with missing/blank question_text", async () => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const { POST } = await import("@/app/api/exams/route");

      const res = await POST(
        req({ ...VALID_BODY, questions: [{ question_text: "   ", max_score: 10 }] }),
      );

      expect(res.status).toBe(400);
    });

    it.each([0, 101, "10"])("rejects an invalid max_score %p", async (maxScore) => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const { POST } = await import("@/app/api/exams/route");

      const res = await POST(
        req({ ...VALID_BODY, questions: [{ question_text: "문제1", max_score: maxScore }] }),
      );

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });
  });

  it("creates the exam and its questions on success", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const examRow = { id: "exam-1", title: "1주차 시험" };
    const supa = createSupabaseMock({
      exams: { insert: { data: examRow, error: null } },
      exam_questions: { insert: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/route");

    const res = await POST(req(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.exam).toEqual(examRow);
    const [questionsChain] = supa.chainsByTable.exam_questions;
    const payload = questionsChain.__calls[0].args[0] as Array<{ exam_id: string }>;
    expect(payload).toHaveLength(1);
    expect(payload[0].exam_id).toBe("exam-1");
  });

  it("rolls back (deletes) the exam and returns 500 when question insertion fails", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const examRow = { id: "exam-doomed", title: "1주차 시험" };
    const supa = createSupabaseMock({
      exams: {
        insert: { data: examRow, error: null },
        delete: { data: null, error: null },
      },
      exam_questions: {
        insert: { data: null, error: { message: "insert failed" } },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/exams/route");

    const res = await POST(req(VALID_BODY));

    expect(res.status).toBe(500);
    const deleteChain = supa.chainsByTable.exams.find((c) =>
      c.__calls.some((cc) => cc.method === "delete"),
    );
    expect(deleteChain).toBeDefined();
    expect(deleteChain!.__calls).toContainEqual({
      method: "eq",
      args: ["id", "exam-doomed"],
    });
  });
});
