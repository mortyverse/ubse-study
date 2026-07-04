import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 이의제기 토론 댓글 (승인 멤버 누구나 — PRD §4.2 step 4) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id: disputeId } = await params;
  const body = (await request.json().catch(() => null)) as {
    content?: unknown;
  } | null;
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (content === "" || content.length > 5000) {
    return NextResponse.json(
      { error: "댓글 내용을 입력해 주세요. (5000자 이내)" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: dispute } = await admin
    .from("exam_disputes")
    .select("id")
    .eq("id", disputeId)
    .maybeSingle();
  if (!dispute) {
    return NextResponse.json({ error: "이의제기를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: comment, error: insertError } = await admin
    .from("exam_dispute_comments")
    .insert({ dispute_id: disputeId, user_id: profile.id, content })
    .select("*")
    .single();

  if (insertError || !comment) {
    return NextResponse.json({ error: "댓글 등록에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ comment }, { status: 201 });
}
