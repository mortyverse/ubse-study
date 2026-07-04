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
