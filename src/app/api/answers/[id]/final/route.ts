import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 관리자 최종 채점 확정 (PRD §4.2 step 5, owner 결정으로 범위 축소 2026-07-05).
 * AI 채점 결과는 자동 확정되므로, 관리자 확정은 (a) 열린 이의제기가 있는
 * 답안(토론 후 재확정, 정답↔오답 양방향) 또는 (b) 미확정 답안(final_score
 * null — AI 채점 실패 구제)에만 허용한다. 확정 시 열린 이의제기는 resolved.
 * 총점/랭킹에는 final_score만 반영된다 (step 6).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const { id: answerId } = await params;
  const body = (await request.json().catch(() => null)) as {
    final_score?: unknown;
  } | null;
  const finalScore = body?.final_score;

  if (typeof finalScore !== "number" || !Number.isFinite(finalScore) || finalScore < 0) {
    return NextResponse.json(
      { error: "final_score는 0 이상의 숫자여야 합니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: answer } = await admin
    .from("exam_answers")
    .select("id, final_score, exam_questions!inner(max_score)")
    .eq("id", answerId)
    .maybeSingle();
  if (!answer) {
    return NextResponse.json({ error: "답안을 찾을 수 없습니다." }, { status: 404 });
  }
  const maxScore = (answer.exam_questions as unknown as { max_score: number })
    .max_score;

  // 자동 확정 체제: 이미 확정된 답안은 열린 이의제기가 있을 때만 재확정 가능
  if (answer.final_score !== null) {
    const { data: openDispute } = await admin
      .from("exam_disputes")
      .select("id")
      .eq("answer_id", answerId)
      .eq("status", "open")
      .maybeSingle();
    if (!openDispute) {
      return NextResponse.json(
        { error: "이의제기가 진행 중인 답안만 다시 확정할 수 있습니다." },
        { status: 409 },
      );
    }
  }
  if (finalScore > maxScore) {
    return NextResponse.json(
      { error: `final_score는 배점(${maxScore}점)을 넘을 수 없습니다.` },
      { status: 400 },
    );
  }

  const { data: updated, error: updateError } = await admin
    .from("exam_answers")
    .update({
      final_score: finalScore,
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", answerId)
    .select("id, final_score, resolved_by, resolved_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "최종 점수 확정에 실패했습니다." }, { status: 500 });
  }

  await admin
    .from("exam_disputes")
    .update({ status: "resolved" })
    .eq("answer_id", answerId)
    .eq("status", "open");

  return NextResponse.json({ answer: updated });
}
