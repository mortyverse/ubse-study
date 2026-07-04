import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../helpers/supabase-mock";
import type { Exam, ExamSubmission } from "@/lib/types";

const { createAdminClientMock, afterCallbacks } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

// Keep NextResponse (and everything else) real; only stub out `after` so the
// background-grading trigger is captured instead of actually running inside
// Next's request-scoped after() (which errors outside a real request).
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb);
    },
  };
});

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: "exam-1",
    title: "1주차 시험",
    week_number: 1,
    time_limit_minutes: 30,
    created_by: "admin-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function submission(overrides: Partial<ExamSubmission> = {}): ExamSubmission {
  return {
    id: "sub-1",
    exam_id: "exam-1",
    user_id: "member-1",
    started_at: "2026-01-01T12:00:00.000Z",
    submitted_at: null,
    grading_status: "pending",
    created_at: "2026-01-01T12:00:00.000Z",
    updated_at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("deadlineOf", () => {
  it("computes deadline = started_at + time_limit_minutes", async () => {
    const { deadlineOf } = await import("@/lib/exams");
    const d = deadlineOf(
      submission({ started_at: "2026-01-01T12:00:00.000Z" }),
      exam({ time_limit_minutes: 45 }),
    );
    expect(d.toISOString()).toBe("2026-01-01T12:45:00.000Z");
  });
});

describe("finalizeSubmission", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    afterCallbacks.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps submitted_at with the current server time when called before the deadline", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const deadline = new Date("2026-01-01T12:45:00.000Z");
    const supa = createSupabaseMock({
      exam_submissions: {
        update: {
          data: submission({ submitted_at: "2026-01-01T12:10:00.000Z" }),
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { finalizeSubmission } = await import("@/lib/exams");

    const result = await finalizeSubmission("sub-1", deadline);

    expect(result).not.toBeNull();
    const [chain] = supa.chainsByTable.exam_submissions;
    const payload = chain.__calls[0].args[0] as { submitted_at: string };
    expect(payload.submitted_at).toBe("2026-01-01T12:10:00.000Z");
  });

  it("caps submitted_at at the deadline when now is past the deadline (server clock is authoritative, never the client's)", async () => {
    const deadline = new Date("2026-01-01T12:45:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T13:30:00.000Z")); // way past deadline
    const supa = createSupabaseMock({
      exam_submissions: {
        update: {
          data: submission({ submitted_at: deadline.toISOString() }),
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { finalizeSubmission } = await import("@/lib/exams");

    await finalizeSubmission("sub-1", deadline);

    const [chain] = supa.chainsByTable.exam_submissions;
    const payload = chain.__calls[0].args[0] as { submitted_at: string };
    expect(payload.submitted_at).toBe(deadline.toISOString());
  });

  it("guards the update with .is('submitted_at', null) — a conditional update so a second racer cannot re-finalize", async () => {
    const deadline = new Date("2026-01-01T12:45:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const supa = createSupabaseMock({
      exam_submissions: {
        update: { data: submission(), error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { finalizeSubmission } = await import("@/lib/exams");

    await finalizeSubmission("sub-1", deadline);

    const [chain] = supa.chainsByTable.exam_submissions;
    expect(chain.__calls).toContainEqual({ method: "is", args: ["submitted_at", null] });
    expect(chain.__calls).toContainEqual({ method: "eq", args: ["id", "sub-1"] });
  });

  it("returns null and does NOT trigger background grading when the conditional update finds nothing (already submitted)", async () => {
    const deadline = new Date("2026-01-01T12:45:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const supa = createSupabaseMock({
      exam_submissions: {
        update: { data: null, error: null }, // conditional update matched 0 rows
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { finalizeSubmission } = await import("@/lib/exams");

    const result = await finalizeSubmission("sub-1", deadline);

    expect(result).toBeNull();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("triggers the background grading job (via after()) exactly once when finalize succeeds", async () => {
    const deadline = new Date("2026-01-01T12:45:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const supa = createSupabaseMock({
      exam_submissions: {
        update: { data: submission(), error: null },
      },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { finalizeSubmission } = await import("@/lib/exams");

    await finalizeSubmission("sub-1", deadline);

    expect(afterCallbacks).toHaveLength(1);
  });
});

describe("autoSubmitIfExpired", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    afterCallbacks.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a no-op before the deadline — returns the submission untouched and never calls the DB", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:10:00.000Z"));
    const supa = createSupabaseMock({ exam_submissions: { update: { data: null, error: null } } });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { autoSubmitIfExpired } = await import("@/lib/exams");
    const s = submission({ started_at: "2026-01-01T12:00:00.000Z" });

    const result = await autoSubmitIfExpired(s, exam({ time_limit_minutes: 30 }));

    expect(result).toBe(s);
    expect(supa.chainsByTable.exam_submissions ?? []).toHaveLength(0);
  });

  it("returns the submission unchanged when it is already submitted, regardless of clock", async () => {
    vi.setSystemTime(new Date("2026-01-01T13:00:00.000Z"));
    const supa = createSupabaseMock({ exam_submissions: { update: { data: null, error: null } } });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { autoSubmitIfExpired } = await import("@/lib/exams");
    const s = submission({ submitted_at: "2026-01-01T12:05:00.000Z" });

    const result = await autoSubmitIfExpired(s, exam({ time_limit_minutes: 30 }));

    expect(result).toBe(s);
    expect(supa.chainsByTable.exam_submissions ?? []).toHaveLength(0);
  });

  it("finalizes (caps submitted_at at the deadline) once the deadline has passed", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:45:00.000Z")); // 15 min past a 30-min limit
    const s = submission({ started_at: "2026-01-01T12:00:00.000Z" });
    const finalizedRow = { ...s, submitted_at: "2026-01-01T12:30:00.000Z" };
    const supa = createSupabaseMock({
      exam_submissions: { update: { data: finalizedRow, error: null } },
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { autoSubmitIfExpired } = await import("@/lib/exams");

    const result = await autoSubmitIfExpired(s, exam({ time_limit_minutes: 30 }));

    expect(result.submitted_at).toBe("2026-01-01T12:30:00.000Z");
    const [chain] = supa.chainsByTable.exam_submissions;
    const payload = chain.__calls[0].args[0] as { submitted_at: string };
    expect(payload.submitted_at).toBe("2026-01-01T12:30:00.000Z"); // capped, not 12:45
  });

  it("falls back to a deadline-stamped local object when finalize races and returns null (e.g. concurrently finalized by another request)", async () => {
    vi.setSystemTime(new Date("2026-01-01T12:45:00.000Z"));
    const s = submission({ started_at: "2026-01-01T12:00:00.000Z" });
    const supa = createSupabaseMock({
      exam_submissions: { update: { data: null, error: null } }, // lost the race
    });
    createAdminClientMock.mockReturnValue({ from: supa.from });
    const { autoSubmitIfExpired } = await import("@/lib/exams");

    const result = await autoSubmitIfExpired(s, exam({ time_limit_minutes: 30 }));

    expect(result.submitted_at).toBe("2026-01-01T12:30:00.000Z");
  });
});
