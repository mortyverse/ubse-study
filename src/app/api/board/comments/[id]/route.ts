import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 댓글 삭제 — 작성자 본인만 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: comment } = await admin
    .from("board_comments")
    .select("id, author_id")
    .eq("id", id)
    .maybeSingle();
  if (!comment) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }
  if (comment.author_id !== profile.id) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  const { error: dbError } = await admin.from("board_comments").delete().eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
