import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AppUser } from "@/lib/types";
import { createSupabaseMock } from "../../helpers/supabase-mock";

const { requireAdminMock, createClientMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: requireAdminMock,
  requireApproved: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

function adminProfile(id = "admin-1"): AppUser {
  return {
    id,
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
  return new Request("http://localhost/api/admin/approvals/user-2", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function params(userId = "user-2") {
  return { params: Promise.resolve({ userId }) };
}

describe("PATCH /api/admin/approvals/[userId]", () => {
  it("rejects a non-admin caller by passing through the requireAdmin error", async () => {
    requireAdminMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    });
    const { PATCH } = await import("@/app/api/admin/approvals/[userId]/route");

    const res = await PATCH(req({ action: "approve" }), params());

    expect(res.status).toBe(403);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  describe("action whitelist", () => {
    it.each(["APPROVE", "delete", "", null, undefined])(
      "rejects invalid action %p with 400",
      async (action) => {
        requireAdminMock.mockResolvedValue({ profile: adminProfile(), error: null });
        const { PATCH } = await import("@/app/api/admin/approvals/[userId]/route");

        const res = await PATCH(req({ action }), params());

        expect(res.status).toBe(400);
        expect(createClientMock).not.toHaveBeenCalled();
      },
    );
  });

  it("blocks an admin from changing their own status (400)", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile("admin-1"), error: null });
    const { PATCH } = await import("@/app/api/admin/approvals/[userId]/route");

    const res = await PATCH(req({ action: "approve" }), params("admin-1"));

    expect(res.status).toBe(400);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("approves a pending user: status -> approved, approved_by = calling admin, approved_at = server time", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile("admin-1"), error: null });
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    vi.useFakeTimers();
    const supa = createSupabaseMock({
      users: {
        update: {
          data: { id: "user-2", display_name: "New Member", status: "approved" },
          error: null,
        },
      },
    });
    createClientMock.mockResolvedValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/admin/approvals/[userId]/route");

    const res = await PATCH(req({ action: "approve" }), params("user-2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.status).toBe("approved");

    const updateChain = supa.chainsByTable.users[0];
    const payload = updateChain.__calls[0].args[0];
    expect(payload).toEqual({
      status: "approved",
      approved_by: "admin-1",
      approved_at: "2026-01-01T12:00:00.000Z",
    });
    vi.useRealTimers();
  });

  it("rejects a user: status -> rejected", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile("admin-1"), error: null });
    const supa = createSupabaseMock({
      users: {
        update: {
          data: { id: "user-2", display_name: "New Member", status: "rejected" },
          error: null,
        },
      },
    });
    createClientMock.mockResolvedValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/admin/approvals/[userId]/route");

    const res = await PATCH(req({ action: "reject" }), params("user-2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.status).toBe("rejected");

    const updateChain = supa.chainsByTable.users[0];
    const payload = updateChain.__calls[0].args[0];
    expect(payload).toEqual({
      status: "rejected",
      approved_by: "admin-1",
      approved_at: expect.any(String),
    });
  });

  it("[approval-gate transition integrity] ignores extra/malicious client fields — update payload contains EXACTLY status/approved_by/approved_at, never role or a client-supplied status/approved_by", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile("admin-1"), error: null });
    const supa = createSupabaseMock({
      users: {
        update: {
          data: { id: "user-2", display_name: "New Member", status: "approved" },
          error: null,
        },
      },
    });
    createClientMock.mockResolvedValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/admin/approvals/[userId]/route");

    const maliciousBody = {
      action: "approve",
      role: "admin",
      status: "rejected",
      approved_by: "attacker-controlled-id",
      approved_at: "1970-01-01T00:00:00.000Z",
    };
    await PATCH(req(maliciousBody), params("user-2"));

    const updateChain = supa.chainsByTable.users[0];
    const payload = updateChain.__calls[0].args[0] as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual([
      "approved_at",
      "approved_by",
      "status",
    ]);
    expect(payload.status).toBe("approved"); // derived from action, not client's status field
    expect(payload.approved_by).toBe("admin-1"); // the calling admin's own id, not client input
    expect(payload.approved_at).not.toBe("1970-01-01T00:00:00.000Z");
    expect(payload).not.toHaveProperty("role");
  });

  it("returns 404 when the target user does not exist", async () => {
    requireAdminMock.mockResolvedValue({ profile: adminProfile("admin-1"), error: null });
    const supa = createSupabaseMock({
      users: {
        update: { data: null, error: null },
      },
    });
    createClientMock.mockResolvedValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/admin/approvals/[userId]/route");

    const res = await PATCH(req({ action: "approve" }), params("no-such-user"));

    expect(res.status).toBe(404);
  });
});
