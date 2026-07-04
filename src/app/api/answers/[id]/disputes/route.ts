import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 이의제기 등록 (승인 멤버, 본인 답안에만 — PRD §4.2 step 4).
 * 채점 완료(completed) 후에만 가능. 같은 답안에 열린 이의제기가 있으면 중복 불가.
 * 등록되는 순간 해당 답안은 RLS 정책상 전체 승인 멤버에게 공개된다(토론용).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id: answerId } = await params;
  const admin = createAdminClient();

  const { data: answer } = await admin
    .from("exam_answers")
    .select("id, ai_score, exam_submissions!inner(user_id, grading_status)")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer) {
    return NextResponse.json({ error: "답안을 찾을 수 없습니다." }, { status: 404 });
  }
  const submission = answer.exam_submissions as unknown as {
    user_id: string;
    grading_status: string;
  };
  if (submission.user_id !== profile.id) {
    return NextResponse.json(
      { error: "본인 답안에만 이의제기할 수 있습니다." },
      { status: 403 },
    );
  }
  if (submission.grading_status !== "completed") {
    return NextResponse.json(
      { error: "채점 완료 후에 이의제기할 수 있습니다." },
      { status: 409 },
    );
  }

  const { data: existingOpen } = await admin
    .from("exam_disputes")
    .select("id")
    .eq("answer_id", answerId)
    .eq("status", "open")
    .maybeSingle();
  if (existingOpen) {
    return NextResponse.json(
      { error: "이미 진행 중인 이의제기가 있습니다." },
      { status: 409 },
    );
  }

  const { data: dispute, error: insertError } = await admin
    .from("exam_disputes")
    .insert({ answer_id: answerId, created_by: profile.id })
    .select("*")
    .single();

  if (insertError || !dispute) {
    return NextResponse.json({ error: "이의제기 등록에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ dispute }, { status: 201 });
}
