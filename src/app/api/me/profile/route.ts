import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_NAME_LENGTH = 30;
const MAX_BIO_LENGTH = 100;

/**
 * 본인 프로필 수정 (이름 + 한 줄 소개, PRD §4.4 확장).
 * 고정 payload: display_name/bio 두 컬럼만, 본인 행만 쓴다.
 * (users에는 member self-UPDATE RLS 정책이 없으므로 — 0006/0015 설계 —
 *  이 경로가 유일한 수정 창구. role/status 등은 여기서도 건드릴 수 없다)
 */
export async function PATCH(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    display_name?: unknown;
    bio?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (typeof body.display_name !== "string" || body.display_name.trim().length === 0) {
    return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
  }
  const displayName = body.display_name.trim();
  if (displayName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `이름은 ${MAX_NAME_LENGTH}자 이내여야 합니다.` },
      { status: 400 },
    );
  }

  let bio: string | null = null;
  if (body.bio !== null && body.bio !== undefined && body.bio !== "") {
    if (typeof body.bio !== "string") {
      return NextResponse.json({ error: "한 줄 소개 형식이 올바르지 않습니다." }, { status: 400 });
    }
    bio = body.bio.trim().slice(0, MAX_BIO_LENGTH) || null;
  }

  const admin = createAdminClient();
  const { data, error: dbError } = await admin
    .from("users")
    .update({ display_name: displayName, bio })
    .eq("id", profile.id)
    .select("id, display_name, bio")
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "프로필 저장에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
