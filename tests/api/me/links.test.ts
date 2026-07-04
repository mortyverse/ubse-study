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
  return new Request("http://localhost/api/me/links", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/me/links", () => {
  it("rejects an unapproved caller by passing through the requireApproved error", async () => {
    requireApprovedMock.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 403 }),
    });
    const { PATCH } = await import("@/app/api/me/links/route");

    const res = await PATCH(req({ github_url: "https://github.com/octocat" }));

    expect(res.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  describe("URL validation", () => {
    it.each([
      "javascript:alert(1)",
      "ftp://x",
      "a".repeat(501),
      42,
      true,
      {},
    ])("rejects an invalid github_url %p with 400", async (value) => {
      requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
      const { PATCH } = await import("@/app/api/me/links/route");

      const res = await PATCH(req({ github_url: value }));

      expect(res.status).toBe(400);
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it.each(["javascript:alert(1)", "ftp://x"])(
      "rejects an invalid project_url %p with 400",
      async (value) => {
        requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
        const { PATCH } = await import("@/app/api/me/links/route");

        const res = await PATCH(req({ project_url: value }));

        expect(res.status).toBe(400);
        expect(createAdminClientMock).not.toHaveBeenCalled();
      },
    );

    it("accepts a valid https URL", async () => {
      requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
      const supa = createSupabaseMock({
        users: {
          update: {
            data: {
              id: "member-1",
              github_url: "https://github.com/octocat",
              project_url: null,
            },
            error: null,
          },
        },
      });
      createAdminClientMock.mockReturnValue({ from: supa.from });
      const { PATCH } = await import("@/app/api/me/links/route");

      const res = await PATCH(req({ github_url: "https://github.com/octocat" }));

      expect(res.status).toBe(200);
    });
  });

  describe("clearing links", () => {
    it.each([null, ""])("treats %p as clearing the link (stored as null)", async (value) => {
      requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
      const supa = createSupabaseMock({
        users: {
          update: {
            data: { id: "member-1", github_url: null, project_url: null },
            error: null,
          },
        },
      });
      createAdminClientMock.mockReturnValue({ from: supa.from });
      const { PATCH } = await import("@/app/api/me/links/route");

      const res = await PATCH(req({ github_url: value, project_url: value }));

      expect(res.status).toBe(200);
      const [chain] = supa.chainsByTable.users;
      const payload = chain.__calls[0].args[0] as Record<string, unknown>;
      expect(payload.github_url).toBeNull();
      expect(payload.project_url).toBeNull();
    });
  });

  it("writes EXACTLY {github_url, project_url} scoped to the caller's own id — no role/status injection possible", async () => {
    requireApprovedMock.mockResolvedValue({ profile: memberProfile(), error: null });
    const supa = createSupabaseMock({
      users: {
        update: {
          data: {
            id: "member-1",
            github_url: "https://github.com/octocat",
            project_url: "https://example.com/project",
          },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { PATCH } = await import("@/app/api/me/links/route");

    const maliciousBody = {
      github_url: "https://github.com/octocat",
      project_url: "https://example.com/project",
      role: "admin",
      status: "approved",
      id: "someone-else",
    };
    await PATCH(req(maliciousBody));

    const [chain] = supa.chainsByTable.users;
    const payload = chain.__calls[0].args[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["github_url", "project_url"]);
    expect(chain.__calls).toContainEqual({ method: "eq", args: ["id", "member-1"] });
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("id");
  });
});
