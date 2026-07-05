import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HeroChipColor } from "@/lib/types";

const COLORS: HeroChipColor[] = [
  "violet", "slate", "sage", "terracotta", "amber", "peach", "pink",
];
const MAX_CHIPS = 40;

/** 히어로 중력 블록 추가 (승인 멤버 누구나 — 삭제는 admin 전용 별도 라우트) */
export async function POST(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    label?: unknown;
    color?: unknown;
  } | null;

  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (label === "" || label.length > 20) {
    return NextResponse.json(
      { error: "블록 문구는 1–20자여야 합니다." },
      { status: 400 },
    );
  }
  const color = body?.color as HeroChipColor | undefined;
  if (!color || !COLORS.includes(color)) {
    return NextResponse.json(
      { error: "색상은 7가지 팔레트 중에서만 선택할 수 있습니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 물리 월드가 무한히 붐비지 않게 상한을 둔다
  const { count } = await admin
    .from("hero_chips")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_CHIPS) {
    return NextResponse.json(
      { error: `블록은 최대 ${MAX_CHIPS}개까지만 둘 수 있습니다.` },
      { status: 400 },
    );
  }

  const { data: chip, error: dbError } = await admin
    .from("hero_chips")
    .insert({ label, color, created_by: profile.id })
    .select("id, label, color, created_at")
    .single();

  if (dbError || !chip) {
    return NextResponse.json({ error: "블록 추가에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ chip }, { status: 201 });
}
