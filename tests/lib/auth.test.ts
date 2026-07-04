import { describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/types";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

function mockSession(opts: { userId: string | null; profile: Partial<AppUser> | null }) {
  createClientMock.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: opts.userId ? { claims: { sub: opts.userId } } : null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: opts.profile, error: null }),
    })),
  });
}

function baseProfile(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user-1",
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
    ...overrides,
  };
}

describe("requireApproved", () => {
  it("returns 401 when there is no session", async () => {
    mockSession({ userId: null, profile: null });
    const { requireApproved } = await import("@/lib/auth");

    const { profile, error } = await requireApproved();

    expect(profile).toBeNull();
    expect(error?.status).toBe(401);
  });

  it("returns 403 when the user's status is pending", async () => {
    mockSession({ userId: "user-1", profile: baseProfile({ status: "pending" }) });
    const { requireApproved } = await import("@/lib/auth");

    const { profile, error } = await requireApproved();

    expect(profile).toBeNull();
    expect(error?.status).toBe(403);
  });

  it("returns 403 when the user's status is rejected", async () => {
    mockSession({ userId: "user-1", profile: baseProfile({ status: "rejected" }) });
    const { requireApproved } = await import("@/lib/auth");

    const { profile, error } = await requireApproved();

    expect(profile).toBeNull();
    expect(error?.status).toBe(403);
  });

  it("passes through the profile when the user is approved", async () => {
    const approved = baseProfile({ status: "approved" });
    mockSession({ userId: "user-1", profile: approved });
    const { requireApproved } = await import("@/lib/auth");

    const { profile, error } = await requireApproved();

    expect(error).toBeNull();
    expect(profile).toEqual(approved);
  });
});

describe("requireAdmin", () => {
  it("returns 403 for an approved member (non-admin role)", async () => {
    mockSession({
      userId: "user-1",
      profile: baseProfile({ status: "approved", role: "member" }),
    });
    const { requireAdmin } = await import("@/lib/auth");

    const { profile, error } = await requireAdmin();

    expect(profile).toBeNull();
    expect(error?.status).toBe(403);
  });

  it("passes through the profile for an approved admin", async () => {
    const admin = baseProfile({ status: "approved", role: "admin" });
    mockSession({ userId: "admin-1", profile: admin });
    const { requireAdmin } = await import("@/lib/auth");

    const { profile, error } = await requireAdmin();

    expect(error).toBeNull();
    expect(profile).toEqual(admin);
  });

  it("still returns 401/403 for unauthenticated/pending before checking role", async () => {
    mockSession({ userId: null, profile: null });
    const { requireAdmin } = await import("@/lib/auth");

    const { error } = await requireAdmin();
    expect(error?.status).toBe(401);
  });
});
