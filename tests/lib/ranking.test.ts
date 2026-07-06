import { describe, expect, it } from "vitest";
import { attendanceRateOf, computeRanking } from "@/lib/ranking";
import type { ScoringSettings } from "@/lib/types";

describe("attendanceRateOf", () => {
  it("counts present as full credit (1)", () => {
    expect(attendanceRateOf(["present"], 1)).toBe(1);
  });

  it("counts late as half credit (0.5)", () => {
    expect(attendanceRateOf(["late"], 1)).toBe(0.5);
  });

  it("counts absent as zero credit", () => {
    expect(attendanceRateOf(["absent"], 1)).toBe(0);
  });

  it("returns 0 when there are 0 finished sessions (no division by zero)", () => {
    expect(attendanceRateOf([], 0)).toBe(0);
    expect(attendanceRateOf(["present"], 0)).toBe(0);
  });

  it("averages a mix of statuses over the total session count", () => {
    // present + late + absent + present = (1 + 0.5 + 0 + 1) / 4 = 0.625
    expect(attendanceRateOf(["present", "late", "absent", "present"], 4)).toBeCloseTo(0.625);
  });
});

describe("computeRanking", () => {
  const settings: ScoringSettings = { attendance_weight: 100 };

  function member(overrides: Partial<Parameters<typeof computeRanking>[0][number]>) {
    return {
      user_id: "u",
      display_name: "이름",
      avatar_url: null,
      github_url: null,
      project_url: null,
      final_scores: [],
      attendance: [],
      like_total: 0,
      ...overrides,
    };
  }

  it("exam_total is the sum of ONLY the provided final_scores (AI scores are never part of the input by design)", () => {
    const [entry] = computeRanking(
      [member({ user_id: "a", final_scores: [10, 20, 30], attendance: [] })],
      0,
      settings,
    );
    // computeRanking's MemberInput type has no ai_score field at all — the
    // caller (buildRanking) is the only place scores can be smuggled in, and
    // it explicitly filters exam_answers by `final_score is not null`. This
    // test locks in that the pure reducer itself sums exactly what's given.
    expect(entry.exam_total).toBe(60);
  });

  it("total_score = exam_total + attendance_rate * attendance_weight", () => {
    const [entry] = computeRanking(
      [
        member({
          user_id: "a",
          final_scores: [50],
          attendance: ["present", "present"],
        }),
      ],
      2,
      { attendance_weight: 20 },
    );
    // rate = 1.0, total = 50 + 1.0*20 = 70
    expect(entry.attendance_rate).toBe(1);
    expect(entry.total_score).toBe(70);
  });

  it("applies the weight from settings (not a hardcoded value)", () => {
    const members = [member({ user_id: "a", final_scores: [0], attendance: ["present"] })];
    const low = computeRanking(members, 1, { attendance_weight: 10 })[0];
    const high = computeRanking(members, 1, { attendance_weight: 200 })[0];
    expect(low.total_score).toBe(10);
    expect(high.total_score).toBe(200);
  });

  it("sorts by total_score descending", () => {
    const entries = computeRanking(
      [
        member({ user_id: "low", display_name: "가", final_scores: [10] }),
        member({ user_id: "high", display_name: "나", final_scores: [90] }),
        member({ user_id: "mid", display_name: "다", final_scores: [50] }),
      ],
      0,
      settings,
    );
    expect(entries.map((e) => e.user_id)).toEqual(["high", "mid", "low"]);
  });

  it("tie-breaks equal total_score by display_name (Korean locale order)", () => {
    const entries = computeRanking(
      [
        member({ user_id: "z", display_name: "다현", final_scores: [50] }),
        member({ user_id: "y", display_name: "가은", final_scores: [50] }),
        member({ user_id: "x", display_name: "나연", final_scores: [50] }),
      ],
      0,
      settings,
    );
    expect(entries.map((e) => e.display_name)).toEqual(["가은", "나연", "다현"]);
  });

  it("assigns competition ranking (1,1,3) for ties instead of dense/ordinal ranking", () => {
    const entries = computeRanking(
      [
        member({ user_id: "a", display_name: "가", final_scores: [100] }),
        member({ user_id: "b", display_name: "나", final_scores: [100] }),
        member({ user_id: "c", display_name: "다", final_scores: [50] }),
        member({ user_id: "d", display_name: "라", final_scores: [10] }),
      ],
      0,
      settings,
    );
    expect(entries.map((e) => e.rank)).toEqual([1, 1, 3, 4]);
  });

  it("assigns competition ranking correctly for a longer tie block (1,1,1,4)", () => {
    const entries = computeRanking(
      [
        member({ user_id: "a", display_name: "가", final_scores: [10] }),
        member({ user_id: "b", display_name: "나", final_scores: [10] }),
        member({ user_id: "c", display_name: "다", final_scores: [10] }),
        member({ user_id: "d", display_name: "라", final_scores: [1] }),
      ],
      0,
      settings,
    );
    expect(entries.map((e) => e.rank)).toEqual([1, 1, 1, 4]);
  });

  it("adds note likes received at exactly +1 point each to total_score", () => {
    const [entry] = computeRanking(
      [
        member({
          user_id: "a",
          final_scores: [50],
          attendance: ["present"],
          like_total: 3,
        }),
      ],
      1,
      { attendance_weight: 20 },
    );
    // 50 + 1.0*20 + 3 = 73
    expect(entry.like_total).toBe(3);
    expect(entry.total_score).toBe(73);
  });

  it("likes can change the ranking order (tie broken by +1 per like)", () => {
    const entries = computeRanking(
      [
        member({ user_id: "no-likes", display_name: "가", final_scores: [50] }),
        member({
          user_id: "liked",
          display_name: "나",
          final_scores: [50],
          like_total: 2,
        }),
      ],
      0,
      settings,
    );
    expect(entries.map((e) => e.user_id)).toEqual(["liked", "no-likes"]);
    expect(entries.map((e) => e.rank)).toEqual([1, 2]);
  });

  it("gives a member with no exams and no attendance a total_score of 0, ranked last", () => {
    const entries = computeRanking(
      [
        member({ user_id: "a", display_name: "가", final_scores: [10] }),
        member({ user_id: "b", display_name: "나", final_scores: [] }),
      ],
      0,
      settings,
    );
    const zero = entries.find((e) => e.user_id === "b")!;
    expect(zero.exam_total).toBe(0);
    expect(zero.total_score).toBe(0);
    expect(zero.rank).toBe(2);
  });
});
