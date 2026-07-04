import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 총점 가중치 설정 (admin 전용 — PRD §4.4 "가중치는 관리자 설정 가능") */
export async function PATCH(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    attendance_weight?: unknown;
  } | null;
  const weight = body?.attendance_weight;

  if (
    typeof weight !== "number" ||
    !Number.isFinite(weight) ||
    weight < 0 ||
    weight > 1000
  ) {
    return NextResponse.json(
      { error: "attendance_weight는 0–1000 사이의 숫자여야 합니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error: dbError } = await admin
    .from("app_settings")
    .update({ value: { attendance_weight: weight } })
    .eq("key", "scoring")
    .select("key, value")
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "설정 저장에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ settings: data.value });
}
