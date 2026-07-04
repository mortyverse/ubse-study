import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceSession } from "@/lib/types";
import type { RosterRow } from "@/components/attendance/types";

/**
 * 만료 세션 lazy 종료 — 별도 크론 없이, 출석 관련 API가 호출될 때마다
 * 서버 시간 기준으로 닫는다. 미입력자는 기본값 결석(absent) 그대로 유지.
 */
export async function closeExpiredSessions() {
  const admin = createAdminClient();
  await admin
    .from("attendance_sessions")
    .update({ is_active: false })
    .eq("is_active", true)
    .lte("closes_at", new Date().toISOString());
}

/**
 * 현재 유효한(서버 시간 기준 마감 전) 활성 세션.
 * is_active 플래그가 아직 안 닫혔어도 closes_at이 지났으면 없는 것으로 취급.
 */
export async function getActiveSession(): Promise<
  (AttendanceSession & { code: string }) | null
> {
  await closeExpiredSessions();
  const admin = createAdminClient();
  const { data } = await admin
    .from("attendance_sessions")
    .select("*")
    .eq("is_active", true)
    .gt("closes_at", new Date().toISOString())
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as (AttendanceSession & { code: string }) | null) ?? null;
}

/**
 * 승인 전원 + 해당 세션 레코드를 병합한 로스터. 레코드가 없는 사람은 결석 취급.
 * 페이지 초기 렌더와 GET /api/attendance/sessions 폴링이 같은 스냅샷을 쓴다.
 */
export async function getRoster(sessionId: string): Promise<RosterRow[]> {
  const admin = createAdminClient();
  const [{ data: members }, { data: records }] = await Promise.all([
    admin
      .from("users")
      .select("id, display_name, avatar_url, github_username")
      .eq("status", "approved")
      .order("display_name", { ascending: true }),
    admin
      .from("attendance_records")
      .select("id, user_id, status, checked_at")
      .eq("session_id", sessionId),
  ]);

  const recordsByUser = new Map((records ?? []).map((r) => [r.user_id, r]));

  return (members ?? []).map((member) => {
    const record = recordsByUser.get(member.id);
    return {
      user: member,
      status: record?.status ?? "absent",
      checked_at: record?.checked_at ?? null,
      recordId: record?.id ?? null,
    };
  });
}

/** 암호학적 난수 기반 4자리 코드 */
export function generateAttendanceCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10000).padStart(4, "0");
}
