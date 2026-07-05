// DB 스키마 계약 (supabase/migrations/0001, 0002와 1:1 대응)
// 마이그레이션 변경 시 여기도 함께 갱신할 것.

export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "present" | "late" | "absent";

export interface AppUser {
  id: string;
  github_id: string | null;
  github_username: string | null;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  approved_by: string | null;
  approved_at: string | null;
  github_url: string | null;
  project_url: string | null;
  created_at: string;
  updated_at: string;
}

// code 컬럼은 authenticated에 컬럼 grant가 없어 세션 클라이언트로는
// 조회 자체가 불가 — admin 전용 API(service role)로만 내려간다.
export interface AttendanceSession {
  id: string;
  week_number: number;
  duration_minutes: number;
  opened_at: string;
  closes_at: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
  status: AttendanceStatus;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterEntry extends AttendanceRecord {
  users: Pick<AppUser, "display_name" | "avatar_url" | "github_username">;
}

// ── Phase 2: 시험 (0005) ────────────────────────────────────────────────────

export type GradingStatus = "pending" | "grading" | "completed" | "failed";
export type DisputeStatus = "open" | "resolved";

export interface Exam {
  id: string;
  title: string;
  week_number: number;
  time_limit_minutes: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_text: string;
  max_score: number;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface ExamSubmission {
  id: string;
  exam_id: string;
  user_id: string;
  started_at: string;
  submitted_at: string | null;
  grading_status: GradingStatus;
  created_at: string;
  updated_at: string;
}

export interface ExamAnswer {
  id: string;
  submission_id: string;
  question_id: string;
  answer_text: string | null;
  ai_score: number | null;
  ai_rationale: string | null;
  final_score: number | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamDispute {
  id: string;
  answer_id: string;
  created_by: string;
  status: DisputeStatus;
  created_at: string;
  updated_at: string;
}

export interface ExamDisputeComment {
  id: string;
  dispute_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ── Phase 3: 주차별 계획 (0008) ─────────────────────────────────────────────

export interface WeeklyPlan {
  id: string;
  week_number: number;
  section_number: number;
  lecture_range: string;
  title: string;
  is_completed: boolean;
  resource_url: string | null;
  created_at: string;
  updated_at: string;
}

// ── Phase 4: 게시판 (0009) ──────────────────────────────────────────────────

export type BoardCategory = "free" | "material" | "note";

export interface BoardPost {
  id: string;
  category: BoardCategory;
  author_id: string;
  title: string;
  content_markdown: string | null;
  link_url: string | null;
  week_number: number | null;
  file_path: string | null;
  file_name: string | null;
  image_paths: string[];
  created_at: string;
  updated_at: string;
}

export interface PlanLecture {
  lecture_number: number;
  week_number: number;
  updated_at: string;
}

export type HeroChipColor =
  | "violet"
  | "slate"
  | "sage"
  | "terracotta"
  | "amber"
  | "peach"
  | "pink";

// created_by는 의도적으로 제외 — 추가자 추적은 관리자가 DB에서 SQL로만 조회한다
export interface HeroChip {
  id: string;
  label: string;
  color: HeroChipColor;
  created_at: string;
}

export interface BoardComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ── Phase 2: 총점/랭킹 (0006) ───────────────────────────────────────────────

/** app_settings 'scoring' row의 value */
export interface ScoringSettings {
  attendance_weight: number;
}

/**
 * 랭킹 산식 (PRD §4.4 + 소유자 결정):
 * 출석률 = (출석 + 지각×0.5) / 종료된 세션 수 (0–1)
 * 총점 = Σ(admin 확정 final_score) + 출석률 × attendance_weight
 * AI 1차 점수(ai_score)는 절대 반영하지 않는다.
 */
export interface RankingEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  github_url: string | null;
  project_url: string | null;
  exam_total: number;
  attendance_rate: number;
  total_score: number;
  rank: number;
}
