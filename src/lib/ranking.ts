import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceStatus, RankingEntry, ScoringSettings } from "@/lib/types";

const DEFAULT_SCORING: ScoringSettings = { attendance_weight: 100 };

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
  /** 필기노트로 받은 좋아요 수 (1개 = +1점) */
  like_total: number;
}

/**
 * 출석률 = (출석 + 지각×0.5) / 본인 출석 레코드 수. 레코드 0개면 0.
 * 분모가 전역 세션 수가 아니라 본인 레코드 수인 이유: 레코드는 세션 시작 시점의
 * 승인 멤버에게만 생성되므로, 중간 합류 멤버가 합류 전 세션만큼 깎이지 않게 한다.
 * (소유자 결정: 지각=0.5, 합류 시점부터 계산)
 */
export function attendanceRateOf(statuses: AttendanceStatus[]): number {
  if (statuses.length === 0) return 0;
  const credit = statuses.reduce(
    (sum, s) => sum + (s === "present" ? 1 : s === "late" ? 0.5 : 0),
    0,
  );
  return credit / statuses.length;
}

/**
 * 총점 = Σ(admin 확정 final_score) + 출석률(0–1) × attendance_weight
 *        + 필기노트 좋아요 수 × 1점 (PRD §4.4 + 좋아요 확장).
 * 랭킹은 총점 내림차순, 동점은 공동 순위(competition ranking: 1,1,3).
 * 순수 함수 — 서버 로직 테스트 대상.
 */
export function computeRanking(
  members: MemberInput[],
  settings: ScoringSettings,
): RankingEntry[] {
  const entries = members.map((m) => {
    const examTotal = m.final_scores.reduce((a, b) => a + b, 0);
    const rate = attendanceRateOf(m.attendance);
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      github_url: m.github_url,
      project_url: m.project_url,
      exam_total: examTotal,
      attendance_rate: rate,
      like_total: m.like_total,
      total_score: examTotal + rate * settings.attendance_weight + m.like_total,
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
 * 출석률 분모는 "종료된 세션(closes_at <= now) 중 본인 레코드가 있는 것"만 —
 * 진행 중 세션이 전원의 출석률을 일시적으로 깎는 것과, 중간 합류 멤버가
 * 합류 전 세션만큼 깎이는 것을 모두 방지.
 */
export async function buildRanking(): Promise<{
  entries: RankingEntry[];
  totalSessions: number;
  settings: ScoringSettings;
}> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [settings, usersRes, sessionsRes, recordsRes, answersRes, likesRes] =
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
      // 필기노트로 받은 좋아요 — 글 작성자 기준으로 집계 (API가 note 외 삽입을 막지만 이중 방어로 필터)
      admin
        .from("post_likes")
        .select("board_posts!inner(author_id, category)")
        .eq("board_posts.category", "note"),
    ]);

  const finishedSessionIds = new Set((sessionsRes.data ?? []).map((s) => s.id));

  const likesByAuthor = new Map<string, number>();
  for (const like of likesRes.data ?? []) {
    const authorId = (like.board_posts as unknown as { author_id: string })
      .author_id;
    likesByAuthor.set(authorId, (likesByAuthor.get(authorId) ?? 0) + 1);
  }

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
    like_total: likesByAuthor.get(u.id) ?? 0,
  }));

  return {
    entries: computeRanking(members, settings),
    totalSessions: finishedSessionIds.size,
    settings,
  };
}
