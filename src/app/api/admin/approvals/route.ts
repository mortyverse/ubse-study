import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** 가입 승인 대기 목록 (admin 전용) — 세션 클라이언트 사용으로 RLS도 함께 검증 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("users")
    .select("id, display_name, github_username, avatar_url, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  return NextResponse.json({ users: data });
}
