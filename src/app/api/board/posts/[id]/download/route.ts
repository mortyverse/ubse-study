import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 첨부 파일 다운로드 URL 발급 (승인 멤버 — PRD §4.5).
 * private 버킷이라 직접 접근 불가 — 60초 signed URL을 발급한다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireApproved();
  if (error) return error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("board_posts")
    .select("id, file_path")
    .eq("id", id)
    .maybeSingle();

  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!post.file_path) {
    return NextResponse.json({ error: "첨부 파일이 없는 글입니다." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from("materials")
    .createSignedUrl(post.file_path, 60, { download: true });

  if (signError || !signed) {
    return NextResponse.json(
      { error: "다운로드 URL 발급에 실패했습니다." },
      { status: 500 },
    );
  }
  return NextResponse.json({ url: signed.signedUrl });
}
