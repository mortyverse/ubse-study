import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 가입 승인/거절 (admin 전용). 세션 클라이언트로 갱신하므로
 * users의 admin-only UPDATE RLS 정책이 3계층째 방어로 함께 작동한다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
  } | null;

  if (!body || !["approve", "reject"].includes(body.action ?? "")) {
    return NextResponse.json(
      { error: "action은 approve 또는 reject여야 합니다." },
      { status: 400 },
    );
  }
  if (userId === profile.id) {
    return NextResponse.json(
      { error: "본인 계정의 상태는 변경할 수 없습니다." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("users")
    .update({
      status: body.action === "approve" ? "approved" : "rejected",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, display_name, status")
    .single();

  if (dbError || !data) {
    return NextResponse.json(
      { error: dbError?.message ?? "대상 사용자를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return NextResponse.json({ user: data });
}
