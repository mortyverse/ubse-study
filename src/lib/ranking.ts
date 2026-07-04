import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceStatus, RankingEntry, ScoringSettings } from "@/lib/types";

export const DEFAULT_SCORING: ScoringSettings = { attendance_weight: 100 };

interface MemberInput {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  github_url: string | null;
  project_url: string | null;
  /** admin 확정 final_score 목록 (null 제외된 값들) — AI 점수는 입력조차 안 됨 */
  final_scores: number[];
  /** 종료된 세션들의 본인 출석 상태 */
  attendance: AttendanceStatus[];
}

/** 출석률 = (출석 + 지각×0.5) / 종료 세션 수. 세션 0개면 0. (소유자 결정: 지각=0.5) */
export function attendanceRateOf(
  statuses: AttendanceStatus[],
  totalSessions: number,
): number {
  if (totalSessions <= 0) return 0;
  const credit = statuses.reduce(
    (sum, s) => sum + (s === "present" ? 1 : s === "late" ? 0.5 : 0),
    0,
  );
  return credit / totalSessions;
}

/**
 * 총점 = Σ(admin 확정 final_score) + 출석률(0–1) × attendance_weight (PRD §4.4).
 * 랭킹은 총점 내림차순, 동점은 공동 순위(competition ranking: 1,1,3).
 * 순수 함수 — 서버 로직 테스트 대상.
 */
export function computeRanking(
  members: MemberInput[],
  totalSessions: number,
  settings: ScoringSettings,
): RankingEntry[] {
  const entries = members.map((m) => {
    const examTotal = m.final_scores.reduce((a, b) => a + b, 0);
    const rate = attendanceRateOf(m.attendance, totalSessions);
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      github_url: m.github_url,
      project_url: m.project_url,
      exam_total: examTotal,
      attendance_rate: rate,
      total_score: examTotal + rate * settings.attendance_weight,
      rank: 0,
    };
  });

  entries.sort(
    (a, b) =>
      b.total_score - a.total_score ||
      a.display_name.localeCompare(b.display_name, "ko"),
  );
  entries.forEach((entry, i) => {
    entry.rank =
      i > 0 && entry.total_score === entries[i - 1].total_score
        ? entries[i - 1].rank
        : i + 1;
  });
  return entries;
}

/** 현재 저장된 가중치 설정 (없으면 기본값) */
export async function getScoringSettings(): Promise<ScoringSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "scoring")
    .maybeSingle();
  const weight = (data?.value as Partial<ScoringSettings> | null)
    ?.attendance_weight;
  return typeof weight === "number" && weight >= 0
    ? { attendance_weight: weight }
    : DEFAULT_SCORING;
}

/**
 * 실명 전체 공개 랭킹 (PRD §4.4 — 익명화 없음).
 * 종료된 세션(closes_at <= now)만 출석률 분모에 넣는다 — 진행 중 세션이
 * 전원의 출석률을 일시적으로 깎는 것을 방지.
 */
export async function buildRanking(): Promise<{
  entries: RankingEntry[];
  totalSessions: number;
  settings: ScoringSettings;
}> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [settings, usersRes, sessionsRes, recordsRes, answersRes] =
    await Promise.all([
      getScoringSettings(),
      admin
        .from("users")
        .select("id, display_name, avatar_url, github_url, project_url")
        .eq("status", "approved"),
      admin
        .from("attendance_sessions")
        .select("id")
        .lte("closes_at", nowIso),
      admin
        .from("attendance_records")
        .select("user_id, status, session_id"),
      admin
        .from("exam_answers")
        .select("final_score, exam_submissions!inner(user_id)")
        .not("final_score", "is", null),
    ]);

  const finishedSessionIds = new Set((sessionsRes.data ?? []).map((s) => s.id));

  const members: MemberInput[] = (usersRes.data ?? []).map((u) => ({
    user_id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    github_url: u.github_url,
    project_url: u.project_url,
    final_scores: (answersRes.data ?? [])
      .filter(
        (a) =>
          (a.exam_submissions as unknown as { user_id: string }).user_id ===
          u.id,
      )
      .map((a) => Number(a.final_score)),
    attendance: (recordsRes.data ?? [])
      .filter(
        (r) => r.user_id === u.id && finishedSessionIds.has(r.session_id),
      )
      .map((r) => r.status as AttendanceStatus),
  }));

  return {
    entries: computeRanking(members, finishedSessionIds.size, settings),
    totalSessions: finishedSessionIds.size,
    settings,
  };
}
