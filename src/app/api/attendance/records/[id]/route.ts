import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = ["present", "late", "absent"] as const;
type Status = (typeof VALID_STATUSES)[number];

/** 출석 상태 수동 조정 (admin 전용) — 지각 처리 등. 양방향 변경 가능 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  const status = body?.status as Status | undefined;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "status는 present/late/absent 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: updated, error: dbError } = await admin
    .from("attendance_records")
    .update({
      status,
      checked_at: status === "absent" ? null : new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, user_id, status, checked_at")
    .single();

  if (dbError || !updated) {
    return NextResponse.json(
      { error: dbError?.message ?? "레코드를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return NextResponse.json({ record: updated });
}
