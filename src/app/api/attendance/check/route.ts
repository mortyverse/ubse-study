import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession } from "@/lib/attendance";

/**
 * 출석 코드 검증 (member). 코드 대조는 오직 이 서버 라우트에서만 일어난다.
 * 시간 판정은 전부 서버 시간 기준 — 클라이언트/localStorage를 신뢰하지 않는다.
 */
export async function POST(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!/^[0-9]{4}$/.test(code)) {
    return NextResponse.json(
      { error: "4자리 숫자 코드를 입력해 주세요." },
      { status: 400 },
    );
  }

  // getActiveSession이 서버 시간으로 만료 세션을 먼저 닫는다
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json(
      { error: "진행 중인 출석 세션이 없습니다." },
      { status: 404 },
    );
  }
  if (new Date(session.closes_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "출석 시간이 종료되었습니다." },
      { status: 400 },
    );
  }
  if (session.code !== code) {
    return NextResponse.json(
      { error: "코드가 일치하지 않습니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: record } = await admin
    .from("attendance_records")
    .select("id, status")
    .eq("session_id", session.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (record && record.status !== "absent") {
    return NextResponse.json(
      { error: "이미 출석 처리되었습니다." },
      { status: 409 },
    );
  }

  const checkedAt = new Date().toISOString();
  const { data: updated, error: writeError } = record
    ? await admin
        .from("attendance_records")
        .update({ status: "present", checked_at: checkedAt })
        .eq("id", record.id)
        // 결석 상태에서만 전이 — 동시 요청으로 인한 중복 처리 방지
        .eq("status", "absent")
        .select("id, status, checked_at")
        .single()
    : await admin
        .from("attendance_records")
        .insert({
          session_id: session.id,
          user_id: profile.id,
          status: "present",
          checked_at: checkedAt,
        })
        .select("id, status, checked_at")
        .single();

  if (writeError || !updated) {
    return NextResponse.json(
      { error: "출석 처리에 실패했습니다. 다시 시도해 주세요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ record: updated });
}
