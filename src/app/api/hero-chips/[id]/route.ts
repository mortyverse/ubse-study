import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 히어로 중력 블록 삭제 (admin 전용) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const admin = createAdminClient();
  const { error: dbError } = await admin.from("hero_chips").delete().eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: "블록 삭제에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
