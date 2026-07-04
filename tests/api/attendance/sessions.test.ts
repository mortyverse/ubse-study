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

function adminProfile(overrides: Partial<AppUser> = {}): AppUser {
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
    github_url: null,
    project_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/attendance/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** No active session already open — the common precondition for the happy path & validation tests. */
function noActiveSessionSupabase(insertResponse: { data: unknown; error: unknown }) {
  return createSupabaseMock({
    attendance_sessions: {
      update: { data: null, error: null }, // closeExpiredSessions sweep
      select: { data: null, error: null }, // getActiveSession finds nothing
      insert: insertResponse,
    },
    users: {
      select: { data: [{ id: "member-1" }, { id: "member-2" }], error: null },
    },
    attendance_records: {
      insert: { data: null, error: null },
    },
  });
}

describe("POST /api/attendance/sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a non-admin caller by passing through the requireAdmin error", async () => {
    requireAdminMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    });
    const { POST } = await import("@/app/api/attendance/sessions/route");

    const res = await POST(req({ week_number: 1, duration_minutes: 3 }));

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  describe("duration_minutes validation (server-side, PRD §4.1: 1–5)", () => {
    beforeEach(() => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    });

    it.each([1, 5])("accepts the boundary value %i", async (duration) => {
      const sessionRow = { id: "sess-1", week_number: 2, duration_minutes: duration };
      const supa = noActiveSessionSupabase({ data: sessionRow, error: null });
      createAdminClientMock.mockReturnValue({ from: supa.from });
      const { POST } = await import("@/app/api/attendance/sessions/route");

      const res = await POST(req({ week_number: 2, duration_minutes: duration }));

      expect(res.status).toBe(201);
    });

    it.each([0, 6, 3.5, undefined])(
      "rejects invalid duration_minutes %p with 400",
      async (duration) => {
        const supa = noActiveSessionSupabase({ data: null, error: null });
        createAdminClientMock.mockReturnValue({ from: supa.from });
        const { POST } = await import("@/app/api/attendance/sessions/route");

        const res = await POST(req({ week_number: 2, duration_minutes: duration }));

        expect(res.status).toBe(400);
      },
    );

    // 강제 형변환 거부: JSON number 타입이 아닌 값은 범위가 맞아 보여도 400.
    it.each(["3", true, [3]])(
      "rejects non-number duration_minutes %p with 400 (no coercion)",
      async (duration) => {
        const supa = noActiveSessionSupabase({ data: null, error: null });
        createAdminClientMock.mockReturnValue({ from: supa.from });
        const { POST } = await import("@/app/api/attendance/sessions/route");

        const res = await POST(req({ week_number: 2, duration_minutes: duration }));

        expect(res.status).toBe(400);
      },
    );
  });

  describe("week_number bounds (1–10)", () => {
    beforeEach(() => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    });

    it.each([1, 10])("accepts the boundary week_number %i", async (week) => {
      const sessionRow = { id: "sess-1", week_number: week, duration_minutes: 3 };
      const supa = noActiveSessionSupabase({ data: sessionRow, error: null });
      createAdminClientMock.mockReturnValue({ from: supa.from });
      const { POST } = await import("@/app/api/attendance/sessions/route");

      const res = await POST(req({ week_number: week, duration_minutes: 3 }));

      expect(res.status).toBe(201);
    });

    it.each([0, 11, 1.5, undefined])(
      "rejects invalid week_number %p with 400",
      async (week) => {
        const supa = noActiveSessionSupabase({ data: null, error: null });
        createAdminClientMock.mockReturnValue({ from: supa.from });
        const { POST } = await import("@/app/api/attendance/sessions/route");

        const res = await POST(req({ week_number: week, duration_minutes: 3 }));

        expect(res.status).toBe(400);
      },
    );

    // 강제 형변환 거부: week_number도 JSON number 타입만 허용.
    it.each(["5", true, [5]])(
      "rejects non-number week_number %p with 400 (no coercion)",
      async (week) => {
        const supa = noActiveSessionSupabase({ data: null, error: null });
        createAdminClientMock.mockReturnValue({ from: supa.from });
        const { POST } = await import("@/app/api/attendance/sessions/route");

        const res = await POST(req({ week_number: week, duration_minutes: 3 }));

        expect(res.status).toBe(400);
      },
    );
  });

  it("returns 409 when an active session already exists", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: {
          data: {
            id: "existing-session",
            week_number: 1,
            code: "1111",
            duration_minutes: 5,
            opened_at: "2026-01-01T11:56:00.000Z",
            closes_at: "2026-01-01T12:01:00.000Z",
            is_active: true,
          },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/sessions/route");

    const res = await POST(req({ week_number: 1, duration_minutes: 3 }));

    expect(res.status).toBe(409);
  });

  it("on success, creates an absent record for every approved member and sets closes_at = opened_at + duration_minutes", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const sessionRow = { id: "sess-new", week_number: 4, duration_minutes: 5 };
    const supa = noActiveSessionSupabase({ data: sessionRow, error: null });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/sessions/route");

    const res = await POST(req({ week_number: 4, duration_minutes: 5 }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.session).toEqual(sessionRow);

    // attendance_sessions.insert() payload has server-computed opened_at/closes_at.
    const insertChain = supa.chainsByTable.attendance_sessions[2];
    const insertPayload = insertChain.__calls[0].args[0] as {
      opened_at: string;
      closes_at: string;
    };
    expect(insertPayload.opened_at).toBe("2026-01-01T12:00:00.000Z");
    expect(insertPayload.closes_at).toBe("2026-01-01T12:05:00.000Z");

    // absent record created for every approved member returned by the users query
    const recordsInsertChain = supa.chainsByTable.attendance_records[0];
    const recordsPayload = recordsInsertChain.__calls[0].args[0];
    expect(recordsPayload).toEqual([
      { session_id: "sess-new", user_id: "member-1", status: "absent" },
      { session_id: "sess-new", user_id: "member-2", status: "absent" },
    ]);
  });

  it("rolls back the session and returns 500 when seeding absent records fails", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const sessionRow = { id: "sess-doomed", week_number: 4, duration_minutes: 5 };
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: null, error: null },
        insert: { data: sessionRow, error: null },
        delete: { data: null, error: null },
      },
      users: {
        select: { data: [{ id: "member-1" }], error: null },
      },
      attendance_records: {
        insert: { data: null, error: { message: "insert failed" } },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { POST } = await import("@/app/api/attendance/sessions/route");

    const res = await POST(req({ week_number: 4, duration_minutes: 5 }));

    expect(res.status).toBe(500);
    // 세션 롤백: 방금 만든 세션 id로 delete가 호출됐는지
    const deleteChain = supa.chainsByTable.attendance_sessions.find((chain) =>
      chain.__calls.some((c) => c.method === "delete"),
    );
    expect(deleteChain).toBeDefined();
    expect(
      deleteChain!.__calls.some(
        (c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "sess-doomed",
      ),
    ).toBe(true);
  });
});
