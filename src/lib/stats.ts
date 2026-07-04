import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceStatus } from "@/lib/types";

/**
 * 메인 대시보드 통계 (PRD §4.7).
 * - 주차별 평균 점수 추이: 해당 주차 시험의 확정(final_score) 총점 평균 vs 본인
 * - 주차별 출석률 추이: (출석 + 지각×0.5) 기준 전체 vs 본인 (종료된 세션만)
 * AI 초안 점수는 어디에도 반영하지 않는다.
 */

export interface WeeklyScorePoint {
  week: number;
  average: number | null;
  mine: number | null;
}

export interface WeeklyAttendancePoint {
  week: number;
  average: number | null; // 0–1
  mine: number | null; // 0–1
}

interface ScoreInputRow {
  week_number: number;
  user_id: string;
  final_total: number;
}

interface AttendanceInputRow {
  week_number: number;
  user_id: string;
  status: AttendanceStatus;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const credit = (s: AttendanceStatus) =>
  s === "present" ? 1 : s === "late" ? 0.5 : 0;

/** 주차별 확정 점수 평균/본인 (순수 함수) */
export function weeklyScoreTrend(
  rows: ScoreInputRow[],
  myUserId: string,
): WeeklyScorePoint[] {
  const byWeek = new Map<number, ScoreInputRow[]>();
  for (const r of rows) {
    const list = byWeek.get(r.week_number) ?? [];
    list.push(r);
    byWeek.set(r.week_number, list);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => {
      const mine = list
        .filter((r) => r.user_id === myUserId)
        .reduce((sum, r) => sum + r.final_total, 0);
      const hasMine = list.some((r) => r.user_id === myUserId);
      return {
        week,
        average: round1(
          list.reduce((sum, r) => sum + r.final_total, 0) / list.length,
        ),
        mine: hasMine ? round1(mine) : null,
      };
    });
}

/** 주차별 출석률 전체/본인 (순수 함수, 0–1) */
export function weeklyAttendanceTrend(
  rows: AttendanceInputRow[],
  myUserId: string,
): WeeklyAttendancePoint[] {
  const byWeek = new Map<number, AttendanceInputRow[]>();
  for (const r of rows) {
    const list = byWeek.get(r.week_number) ?? [];
    list.push(r);
    byWeek.set(r.week_number, list);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => {
      const mineRows = list.filter((r) => r.user_id === myUserId);
      return {
        week,
        average:
          list.length > 0
            ? list.reduce((sum, r) => sum + credit(r.status), 0) / list.length
            : null,
        mine:
          mineRows.length > 0
            ? mineRows.reduce((sum, r) => sum + credit(r.status), 0) /
              mineRows.length
            : null,
      };
    });
}

export interface GroupTrendPoint {
  week: number;
  average: number | null;
  /** memberId → 해당 주차 값 (점수 총점 또는 출석률 0–1), 데이터 없으면 null */
  values: Record<string, number | null>;
}

export interface GroupTrends {
  members: { id: string; name: string }[];
  scoreTrend: GroupTrendPoint[];
  attendanceTrend: GroupTrendPoint[];
}

/** 주차별 멤버 전원의 확정 점수 총점 + 전체 평균 (순수 함수) */
export function weeklyGroupScoreTrend(
  rows: ScoreInputRow[],
  memberIds: string[],
): GroupTrendPoint[] {
  const byWeek = new Map<number, ScoreInputRow[]>();
  for (const r of rows) {
    const list = byWeek.get(r.week_number) ?? [];
    list.push(r);
    byWeek.set(r.week_number, list);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => {
      const values: Record<string, number | null> = {};
      for (const id of memberIds) {
        const mineRows = list.filter((r) => r.user_id === id);
        values[id] =
          mineRows.length > 0
            ? round1(mineRows.reduce((sum, r) => sum + r.final_total, 0))
            : null;
      }
      return {
        week,
        average: round1(
          list.reduce((sum, r) => sum + r.final_total, 0) / list.length,
        ),
        values,
      };
    });
}

/** 주차별 멤버 전원의 출석률(0–1) + 전체 평균 (순수 함수) */
export function weeklyGroupAttendanceTrend(
  rows: AttendanceInputRow[],
  memberIds: string[],
): GroupTrendPoint[] {
  const byWeek = new Map<number, AttendanceInputRow[]>();
  for (const r of rows) {
    const list = byWeek.get(r.week_number) ?? [];
    list.push(r);
    byWeek.set(r.week_number, list);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => {
      const values: Record<string, number | null> = {};
      for (const id of memberIds) {
        const mineRows = list.filter((r) => r.user_id === id);
        values[id] =
          mineRows.length > 0
            ? mineRows.reduce((sum, r) => sum + credit(r.status), 0) /
              mineRows.length
            : null;
      }
      return {
        week,
        average:
          list.length > 0
            ? list.reduce((sum, r) => sum + credit(r.status), 0) / list.length
            : null,
        values,
      };
    });
}

export interface DashboardStats {
  scoreTrend: WeeklyScorePoint[];
  attendanceTrend: WeeklyAttendancePoint[];
}

/** 대시보드용 주차별 추이 2종을 DB에서 집계 */
export async function buildDashboardStats(
  myUserId: string,
): Promise<DashboardStats> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [examsRes, answersRes, sessionsRes, recordsRes] = await Promise.all([
    admin.from("exams").select("id, week_number"),
    admin
      .from("exam_answers")
      .select("final_score, exam_submissions!inner(user_id, exam_id)")
      .not("final_score", "is", null),
    admin
      .from("attendance_sessions")
      .select("id, week_number")
      .lte("closes_at", nowIso),
    admin.from("attendance_records").select("session_id, user_id, status"),
  ]);

  const weekByExam = new Map(
    (examsRes.data ?? []).map((e) => [e.id, e.week_number]),
  );
  // (user, exam)별 확정 총점 → 주차 행으로 변환
  const totals = new Map<string, ScoreInputRow>();
  for (const a of answersRes.data ?? []) {
    const sub = a.exam_submissions as unknown as {
      user_id: string;
      exam_id: string;
    };
    const week = weekByExam.get(sub.exam_id);
    if (week === undefined) continue;
    const key = `${sub.user_id}:${sub.exam_id}`;
    const row = totals.get(key) ?? {
      week_number: week,
      user_id: sub.user_id,
      final_total: 0,
    };
    row.final_total += Number(a.final_score);
    totals.set(key, row);
  }

  const weekBySession = new Map(
    (sessionsRes.data ?? []).map((s) => [s.id, s.week_number]),
  );
  const attendanceRows: AttendanceInputRow[] = (recordsRes.data ?? [])
    .filter((r) => weekBySession.has(r.session_id))
    .map((r) => ({
      week_number: weekBySession.get(r.session_id)!,
      user_id: r.user_id,
      status: r.status as AttendanceStatus,
    }));

  return {
    scoreTrend: weeklyScoreTrend([...totals.values()], myUserId),
    attendanceTrend: weeklyAttendanceTrend(attendanceRows, myUserId),
  };
}

/** 메인 대시보드용 — 승인 멤버 전원의 주차별 점수/출석률 추이 */
export async function buildGroupTrends(): Promise<GroupTrends> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [membersRes, examsRes, answersRes, sessionsRes, recordsRes] =
    await Promise.all([
      admin
        .from("users")
        .select("id, display_name")
        .eq("status", "approved")
        .order("display_name", { ascending: true }),
      admin.from("exams").select("id, week_number"),
      admin
        .from("exam_answers")
        .select("final_score, exam_submissions!inner(user_id, exam_id)")
        .not("final_score", "is", null),
      admin
        .from("attendance_sessions")
        .select("id, week_number")
        .lte("closes_at", nowIso),
      admin.from("attendance_records").select("session_id, user_id, status"),
    ]);

  const members = (membersRes.data ?? []).map((m) => ({
    id: m.id,
    name: m.display_name,
  }));
  const memberIds = members.map((m) => m.id);

  const weekByExam = new Map(
    (examsRes.data ?? []).map((e) => [e.id, e.week_number]),
  );
  const totals = new Map<string, ScoreInputRow>();
  for (const a of answersRes.data ?? []) {
    const sub = a.exam_submissions as unknown as {
      user_id: string;
      exam_id: string;
    };
    const week = weekByExam.get(sub.exam_id);
    if (week === undefined) continue;
    const key = `${sub.user_id}:${sub.exam_id}`;
    const row = totals.get(key) ?? {
      week_number: week,
      user_id: sub.user_id,
      final_total: 0,
    };
    row.final_total += Number(a.final_score);
    totals.set(key, row);
  }

  const weekBySession = new Map(
    (sessionsRes.data ?? []).map((s) => [s.id, s.week_number]),
  );
  const attendanceRows: AttendanceInputRow[] = (recordsRes.data ?? [])
    .filter((r) => weekBySession.has(r.session_id))
    .map((r) => ({
      week_number: weekBySession.get(r.session_id)!,
      user_id: r.user_id,
      status: r.status as AttendanceStatus,
    }));

  return {
    members,
    scoreTrend: weeklyGroupScoreTrend([...totals.values()], memberIds),
    attendanceTrend: weeklyGroupAttendanceTrend(attendanceRows, memberIds),
  };
}
