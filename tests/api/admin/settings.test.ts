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
  return new Request("http://localhost/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/settings", () => {
  it("rejects a non-admin caller by passing through the requireAdmin error", async () => {
    requireAdminMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    });
    const { PATCH } = await import("@/app/api/admin/settings/route");

    const res = await PATCH(req({ attendance_weight: 50 }));

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  describe("bounds and type-strictness", () => {
    it.each([-1, 1001])("rejects out-of-bounds attendance_weight %p", async (weight) => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const { PATCH } = await import("@/app/api/admin/settings/route");

      const res = await PATCH(req({ attendance_weight: weight }));

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it.each(["50", true, null, undefined, [50]])(
      "rejects a non-number attendance_weight %p (no coercion)",
      async (weight) => {
        requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
        const { PATCH } = await import("@/app/api/admin/settings/route");

        const res = await PATCH(req({ attendance_weight: weight }));

        expect(res.status).toBe(400);
        expect(createAdminClientMock).not.toHaveBeenCalled();
      },
    );

    it.each([0, 1000])("accepts the boundary value %i", async (weight) => {
      requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
      const supa = createSupabaseMock({
        app_settings: {
          update: { data: { key: "scoring", value: { attendance_weight: weight } }, error: null },
        },
      });
      createAdminClientMock.mockReturnValue({ from: supa.from });
      const { PATCH } = await import("@/app/api/admin/settings/route");

      const res = await PATCH(req({ attendance_weight: weight }));

      expect(res.status).toBe(200);
    });
  });

  it("writes exactly {value: {attendance_weight: N}} scoped to key='scoring'", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
    const supa = createSupabaseMock({
      app_settings: {
        update: { data: { key: "scoring", value: { attendance_weight: 42 } }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/admin/settings/route");

    const res = await PATCH(req({ attendance_weight: 42 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.settings).toEqual({ attendance_weight: 42 });

    const [chain] = supa.chainsByTable.app_settings;
    expect(chain.__calls[0]).toEqual({
      method: "update",
      args: [{ value: { attendance_weight: 42 } }],
    });
    expect(chain.__calls).toContainEqual({ method: "eq", args: ["key", "scoring"] });
  });
});
