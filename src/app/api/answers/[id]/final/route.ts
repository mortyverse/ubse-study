import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 관리자 최종 채점 확정 (PRD §4.2 step 5).
 * 정답↔오답 양방향 변경 가능 — final_score를 몇 번이고 다시 쓸 수 있다.
 * 확정 시 해당 답안의 열린 이의제기는 resolved 처리된다.
 * 총점/랭킹에는 이 final_score만 반영된다 (AI 초안 미반영, step 6).
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
    .select("id, exam_questions!inner(max_score)")
    .eq("id", answerId)
    .maybeSingle();
  if (!answer) {
    return NextResponse.json({ error: "답안을 찾을 수 없습니다." }, { status: 404 });
  }
  const maxScore = (answer.exam_questions as unknown as { max_score: number })
    .max_score;
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
