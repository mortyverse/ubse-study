import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 강의 블록 주차 이동 (admin 전용 — 주차별 계획 드래그앤드랍).
 * 실제 진도가 계획과 다를 때 강의를 다른 주차로 재배정한다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lecture: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { lecture } = await params;
  const lectureNumber = Number(lecture);
  if (!Number.isInteger(lectureNumber) || lectureNumber < 1) {
    return NextResponse.json({ error: "잘못된 강의 번호입니다." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    week_number?: unknown;
  } | null;
  const weekNumber = body?.week_number;
  if (
    typeof weekNumber !== "number" ||
    !Number.isInteger(weekNumber) ||
    weekNumber < 1 ||
    weekNumber > 10
  ) {
    return NextResponse.json(
      { error: "week_number는 1–10 사이의 정수여야 합니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: updated, error: dbError } = await admin
    .from("plan_lectures")
    .update({ week_number: weekNumber, updated_at: new Date().toISOString() })
    .eq("lecture_number", lectureNumber)
    .select("*")
    .maybeSingle();

  if (dbError) {
    return NextResponse.json({ error: "이동에 실패했습니다." }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "강의를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ lecture: updated });
}
