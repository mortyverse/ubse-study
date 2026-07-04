import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 주차 완료 토글 (admin 전용 — PRD §4.3). member는 읽기 전용. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    is_completed?: unknown;
  } | null;

  if (typeof body?.is_completed !== "boolean") {
    return NextResponse.json(
      { error: "is_completed는 boolean이어야 합니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: plan, error: dbError } = await admin
    .from("weekly_plans")
    .update({ is_completed: body.is_completed })
    .eq("id", id)
    .select("*")
    .single();

  if (dbError || !plan) {
    return NextResponse.json(
      { error: dbError?.message ?? "주차 계획을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return NextResponse.json({ plan });
}
