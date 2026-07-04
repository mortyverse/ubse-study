import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 댓글 작성 (승인 멤버 — PRD §4.5) */
export async function POST(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    post_id?: unknown;
    content?: unknown;
  } | null;

  const postId = typeof body?.post_id === "string" ? body.post_id : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!postId) {
    return NextResponse.json({ error: "post_id가 필요합니다." }, { status: 400 });
  }
  if (content === "" || content.length > 5000) {
    return NextResponse.json(
      { error: "댓글 내용을 입력해 주세요. (5000자 이내)" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("board_posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: comment, error: dbError } = await admin
    .from("board_comments")
    .insert({ post_id: postId, author_id: profile.id, content })
    .select("*")
    .single();

  if (dbError || !comment) {
    return NextResponse.json({ error: "댓글 작성에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ comment }, { status: 201 });
}
