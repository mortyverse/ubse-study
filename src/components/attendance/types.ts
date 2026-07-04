import type { AttendanceStatus } from "@/components/common/status-badge"

/** GET /api/attendance/sessions 응답의 session — code 컬럼은 절대 포함하지 않는다 */
export type SessionMeta = {
  id: string
  week_number: number
  duration_minutes: number
  opened_at: string
  closes_at: string
  is_active: boolean
} | null

export type MyRecord = {
  id: string
  status: AttendanceStatus
  checked_at: string | null
} | null

export type RosterRow = {
  user: {
    id: string
    display_name: string
    avatar_url: string | null
    github_username: string | null
  }
  status: AttendanceStatus
  checked_at: string | null
  recordId: string | null
}
