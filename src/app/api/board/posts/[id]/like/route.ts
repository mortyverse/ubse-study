import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 필기노트 좋아요 토글 (승인 멤버).
 * - note 카테고리 글에만 허용
 * - 본인 글에는 불가 (좋아요 1개 = 랭킹 +1점이므로 셀프 적립 차단)
 * - 이미 눌렀으면 취소, 아니면 추가 — 결과 상태와 총 개수를 돌려준다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("board_posts")
    .select("id, category, author_id")
    .eq("id", id)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  if (post.category !== "note") {
    return NextResponse.json(
      { error: "필기노트 글에만 좋아요를 누를 수 있습니다." },
      { status: 400 },
    );
  }
  if (post.author_id === profile.id) {
    return NextResponse.json(
      { error: "본인 글에는 좋아요를 누를 수 없습니다." },
      { status: 403 },
    );
  }

  const { data: existing } = await admin
    .from("post_likes")
    .select("post_id")
    .eq("post_id", id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (existing) {
    const { error: dbError } = await admin
      .from("post_likes")
      .delete()
      .eq("post_id", id)
      .eq("user_id", profile.id);
    if (dbError) {
      return NextResponse.json({ error: "좋아요 취소에 실패했습니다." }, { status: 500 });
    }
  } else {
    const { error: dbError } = await admin
      .from("post_likes")
      .insert({ post_id: id, user_id: profile.id });
    // PK 충돌(중복 클릭 레이스)은 이미 눌린 상태이므로 성공으로 간주한다.
    if (dbError && dbError.code !== "23505") {
      return NextResponse.json({ error: "좋아요에 실패했습니다." }, { status: 500 });
    }
  }

  const { count } = await admin
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", id);

  return NextResponse.json({ liked: !existing, like_count: count ?? 0 });
}
