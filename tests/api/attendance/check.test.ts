import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function memberProfile(overrides: Partial<AppUser> = {}): AppUser {
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
    ...overrides,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/attendance/check", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const OPEN_SESSION = {
  id: "sess-1",
  week_number: 3,
  code: "4242",
  duration_minutes: 5,
  opened_at: "2026-01-01T11:56:00.000Z",
  closes_at: "2026-01-01T12:01:00.000Z",
  is_active: true,
};

describe("POST /api/attendance/check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z")); // 1 min before close
    requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when there is no session (requireApproved passthrough)", async () => {
    requireApprovedMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "1234" }));

    expect(res.status).toBe(401);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is pending (requireApproved passthrough)", async () => {
    requireApprovedMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 403 }),
    });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "1234" }));

    expect(res.status).toBe(403);
  });

  describe("malformed codes", () => {
    it.each(["12a4", "123", "12345", ""])("rejects %p with 400", async (code) => {
      const { POST } = await import("@/app/api/attendance/check/route");

      const res = await POST(req({ code }));

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });
  });

  it("returns 404 when there is no active session", async () => {
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "4242" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("진행 중인 출석 세션이 없습니다.");
  });

  it("rejects with '출석 시간이 종료되었습니다' when now === closes_at exactly (boundary, server clock)", async () => {
    vi.setSystemTime(new Date(OPEN_SESSION.closes_at)); // exactly at the boundary
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: OPEN_SESSION, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "4242" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("출석 시간이 종료되었습니다.");
  });

  it("rejects one millisecond before the boundary is fine, but at closes_at+0 it's still rejected (<=, not <)", async () => {
    // one ms *after* is unambiguously expired too — confirms the operator is <=
    vi.setSystemTime(new Date(new Date(OPEN_SESSION.closes_at).getTime() + 1));
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: OPEN_SESSION, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "4242" }));

    expect(res.status).toBe(400);
  });

  it("returns '코드가 일치하지 않습니다' for a well-formed but wrong code", async () => {
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: OPEN_SESSION, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "0000" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("코드가 일치하지 않습니다.");
  });

  describe("re-submit after already checked in", () => {
    it.each(["present", "late"] as const)(
      "returns 409 '이미 출석 처리되었습니다' when the existing record status is %s",
      async (status) => {
        const supa = createSupabaseMock({
          attendance_sessions: {
            update: { data: null, error: null },
            select: { data: OPEN_SESSION, error: null },
          },
          attendance_records: {
            select: { data: { id: "rec-1", status }, error: null },
          },
        });
        createAdminClientMock.mockReturnValue({ from: supa.from });
        const { POST } = await import("@/app/api/attendance/check/route");

        const res = await POST(req({ code: "4242" }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toBe("이미 출석 처리되었습니다.");
      },
    );
  });

  it("on the first valid check-in, sets status='present' and stamps checked_at, guarding the update with .eq('status','absent')", async () => {
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: OPEN_SESSION, error: null },
      },
      attendance_records: {
        select: { data: { id: "rec-1", status: "absent" }, error: null },
        update: {
          data: { id: "rec-1", status: "present", checked_at: "2026-01-01T12:00:00.000Z" },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "4242" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.record.status).toBe("present");
    expect(body.record.checked_at).toBe("2026-01-01T12:00:00.000Z");

    // conditional-update race guard: the update chain must only ever flip a
    // still-absent row, never one a concurrent request already flipped.
    const updateChain = supa.chainsByTable.attendance_records[1];
    expect(updateChain.__calls[0].method).toBe("update");
    expect(updateChain.__calls).toContainEqual({
      method: "eq",
      args: ["status", "absent"],
    });
    expect(updateChain.__calls).toContainEqual({ method: "eq", args: ["id", "rec-1"] });
  });

  it("creates a fresh present record when no record exists yet for this user/session", async () => {
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: OPEN_SESSION, error: null },
      },
      attendance_records: {
        select: { data: null, error: null },
        insert: {
          data: { id: "rec-2", status: "present", checked_at: "2026-01-01T12:00:00.000Z" },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/check/route");

    const res = await POST(req({ code: "4242" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.record.status).toBe("present");
  });
});
