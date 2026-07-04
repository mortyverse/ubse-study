import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../helpers/supabase-mock";

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

async function importAttendanceLib() {
  return await import("@/lib/attendance");
}

describe("closeExpiredSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips is_active to false for sessions whose closes_at has passed, using server time", async () => {
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });

    const { closeExpiredSessions } = await importAttendanceLib();
    await closeExpiredSessions();

    const [chain] = supa.chainsByTable.attendance_sessions;
    expect(chain.__calls[0]).toEqual({
      method: "update",
      args: [{ is_active: false }],
    });
    expect(chain.__calls).toContainEqual({
      method: "eq",
      args: ["is_active", true],
    });
    expect(chain.__calls).toContainEqual({
      method: "lte",
      args: ["closes_at", "2026-01-01T12:00:00.000Z"],
    });
  });
});

describe("getActiveSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes expired sessions first (server time), then returns null when nothing is active", async () => {
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });

    const { getActiveSession } = await importAttendanceLib();
    const result = await getActiveSession();

    expect(result).toBeNull();
    // one .from() call for the close-expired sweep, one for the select
    expect(supa.chainsByTable.attendance_sessions).toHaveLength(2);
    expect(supa.chainsByTable.attendance_sessions[0].__calls[0].method).toBe(
      "update",
    );
    expect(supa.chainsByTable.attendance_sessions[1].__calls[0].method).toBe(
      "select",
    );
  });

  it("returns the active session row (with code) when one is currently open", async () => {
    const activeSession = {
      id: "sess-1",
      week_number: 3,
      code: "1234",
      duration_minutes: 5,
      opened_at: "2026-01-01T11:56:00.000Z",
      closes_at: "2026-01-01T12:01:00.000Z",
      is_active: true,
      created_by: "admin-1",
      created_at: "2026-01-01T11:56:00.000Z",
      updated_at: "2026-01-01T11:56:00.000Z",
    };
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: activeSession, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });

    const { getActiveSession } = await importAttendanceLib();
    const result = await getActiveSession();

    expect(result).toEqual(activeSession);
  });

  it("asks the DB for the newest active session (ordered desc, limited to 1) — DB is responsible for actually picking the newest row among multiples", async () => {
    const newest = {
      id: "sess-newest",
      week_number: 4,
      code: "5678",
      duration_minutes: 5,
      opened_at: "2026-01-01T11:59:00.000Z",
      closes_at: "2026-01-01T12:04:00.000Z",
      is_active: true,
      created_by: "admin-1",
      created_at: "2026-01-01T11:59:00.000Z",
      updated_at: "2026-01-01T11:59:00.000Z",
    };
    const supa = createSupabaseMock({
      attendance_sessions: {
        update: { data: null, error: null },
        select: { data: newest, error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });

    const { getActiveSession } = await importAttendanceLib();
    const result = await getActiveSession();

    const selectChain = supa.chainsByTable.attendance_sessions[1];
    expect(selectChain.__calls).toContainEqual({
      method: "order",
      args: ["opened_at", { ascending: false }],
    });
    expect(selectChain.__calls).toContainEqual({ method: "limit", args: [1] });
    expect(result).toEqual(newest);
  });
});

describe("generateAttendanceCode", () => {
  it("always produces a 4-digit numeric string, across many iterations", async () => {
    const { generateAttendanceCode } = await importAttendanceLib();
    for (let i = 0; i < 500; i++) {
      const code = generateAttendanceCode();
      expect(code).toMatch(/^[0-9]{4}$/);
    }
  });
});
