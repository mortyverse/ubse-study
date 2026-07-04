import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 세션 코드 조회 — admin 전용 (PRD §4.1 코드 비밀 유지).
 * authenticated 역할에는 code 컬럼 grant 자체가 없으므로,
 * 이 API(service role + admin 검증)가 코드를 보는 유일한 경로다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("attendance_sessions")
    .select("id, code, closes_at, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ session });
}
