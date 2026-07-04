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
    github_url: null,
    project_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/attendance/records/rec-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function params(id = "rec-1") {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/attendance/records/[id]", () => {
  it("rejects a non-admin caller by passing through the requireAdmin error", async () => {
    requireAdminMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    });
    const { PATCH } = await import("@/app/api/attendance/records/[id]/route");

    const res = await PATCH(req({ status: "present" }), params());

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  describe("status whitelist", () => {
    it.each(["PRESENT", "attended", null, "", "LATE", 1])(
      "rejects invalid status %p with 400",
      async (status) => {
        requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
        const { PATCH } = await import("@/app/api/attendance/records/[id]/route");

        const res = await PATCH(req({ status }), params());

        expect(res.status).toBe(400);
        expect(createAdminClientMock).not.toHaveBeenCalled();
      },
    );
  });

  it("clears checked_at when set to 'absent'", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const supa = createSupabaseMock({
      attendance_records: {
        update: {
          data: { id: "rec-1", user_id: "member-1", status: "absent", checked_at: null },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/attendance/records/[id]/route");

    const res = await PATCH(req({ status: "absent" }), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.record.checked_at).toBeNull();
    const updateChain = supa.chainsByTable.attendance_records[0];
    const payload = updateChain.__calls[0].args[0] as { checked_at: unknown };
    expect(payload.checked_at).toBeNull();
  });

  it.each(["present", "late"] as const)(
    "sets checked_at to a server timestamp when set to %s",
    async (status) => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const supa = createSupabaseMock({
        attendance_records: {
          update: {
            data: { id: "rec-1", user_id: "member-1", status, checked_at: "2026-01-01T12:00:00.000Z" },
            error: null,
          },
        },
      });
      createAdminClientMock.mockReturnValue({ from: supa.from });
      const { PATCH } = await import("@/app/api/attendance/records/[id]/route");

      const res = await PATCH(req({ status }), params());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.record.checked_at).not.toBeNull();
      const updateChain = supa.chainsByTable.attendance_records[0];
      const payload = updateChain.__calls[0].args[0] as { status: string; checked_at: unknown };
      expect(payload.status).toBe(status);
      expect(payload.checked_at).not.toBeNull();
    },
  );

  it("returns 404 when the record does not exist", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const supa = createSupabaseMock({
      attendance_records: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/attendance/records/[id]/route");

    const res = await PATCH(req({ status: "present" }), params("missing-id"));

    expect(res.status).toBe(404);
  });
});
