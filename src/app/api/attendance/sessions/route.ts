import { NextResponse } from "next/server";
import { requireAdmin, requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  closeExpiredSessions,
  generateAttendanceCode,
  getActiveSession,
  getRoster,
} from "@/lib/attendance";

/**
 * 출석 세션 시작 (admin 전용).
 * duration 1–5분 서버 검증(PRD §4.1) — DB CHECK 제약과 이중 방어.
 * 시작과 동시에 승인된 전원의 레코드를 '결석' 기본값으로 생성한다.
 */
export async function POST(request: Request) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    week_number?: unknown;
    duration_minutes?: unknown;
  } | null;

  // 강제 형변환 금지 — JSON number 타입만 허용 ("3", true 등 거부)
  const weekNumber = body?.week_number;
  const durationMinutes = body?.duration_minutes;

  if (
    typeof weekNumber !== "number" ||
    !Number.isInteger(weekNumber) ||
    weekNumber < 1 ||
    weekNumber > 10
  ) {
    return NextResponse.json(
      { error: "week_number는 1–10 사이의 정수여야 합니다." },
      { status: 400 },
    );
  }
  if (
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 5
  ) {
    return NextResponse.json(
      { error: "duration_minutes는 1–5 사이의 정수여야 합니다." },
      { status: 400 },
    );
  }

  const existing = await getActiveSession();
  if (existing) {
    return NextResponse.json(
      { error: "이미 진행 중인 출석 세션이 있습니다." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const openedAt = new Date();
  const closesAt = new Date(openedAt.getTime() + durationMinutes * 60_000);

  const { data: session, error: insertError } = await admin
    .from("attendance_sessions")
    .insert({
      week_number: weekNumber,
      code: generateAttendanceCode(),
      duration_minutes: durationMinutes,
      opened_at: openedAt.toISOString(),
      closes_at: closesAt.toISOString(),
      is_active: true,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (insertError || !session) {
    return NextResponse.json(
      { error: insertError?.message ?? "세션 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  // 승인된 전원 결석 기본 레코드 생성 (로스터 재료 + Realtime 대상).
  // 시딩 실패는 로스터/출석률 무결성을 깨뜨리므로 세션을 롤백하고 실패 처리한다.
  const { data: members, error: membersError } = await admin
    .from("users")
    .select("id")
    .eq("status", "approved");

  const seedError = membersError
    ? membersError
    : members && members.length > 0
      ? (
          await admin.from("attendance_records").insert(
            members.map((m) => ({
              session_id: session.id,
              user_id: m.id,
              status: "absent" as const,
            })),
          )
        ).error
      : null;

  if (seedError) {
    await admin.from("attendance_sessions").delete().eq("id", session.id);
    return NextResponse.json(
      { error: "출석 레코드 생성에 실패해 세션을 취소했습니다. 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  // 호출자는 admin으로 검증됐으므로 코드 포함 반환 (member에게는 절대 노출 금지)
  return NextResponse.json({ session }, { status: 201 });
}

/** 활성 세션 조회 (승인 사용자) — 코드는 절대 포함하지 않는다 */
export async function GET() {
  const { profile, error } = await requireApproved();
  if (error) return error;

  await closeExpiredSessions();
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ session: null, myRecord: null, roster: [] });
  }

  const roster = await getRoster(session.id);
  const myRow = roster.find((r) => r.user.id === profile.id);
  const myRecord = myRow?.recordId
    ? { id: myRow.recordId, status: myRow.status, checked_at: myRow.checked_at }
    : null;

  // code 필드 제거 후 반환
  const { code: _code, ...safeSession } = session;
  return NextResponse.json({ session: safeSession, myRecord, roster });
}
