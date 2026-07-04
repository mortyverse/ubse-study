import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceSession } from "@/lib/types";

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

/** 암호학적 난수 기반 4자리 코드 */
export function generateAttendanceCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10000).padStart(4, "0");
}
