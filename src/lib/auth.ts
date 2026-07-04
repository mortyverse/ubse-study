import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

export interface SessionProfile {
  userId: string | null;
  profile: AppUser | null;
}

/** 현재 세션의 auth uid + users 프로필 행 (본인 행은 RLS로 항상 조회 가능) */
export async function getSessionProfile(): Promise<SessionProfile> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = (data?.claims?.sub as string | undefined) ?? null;
  if (!userId) return { userId: null, profile: null };

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  return { userId, profile: (profile as AppUser | null) ?? null };
}

type GuardResult =
  | { profile: AppUser; error: null }
  | { profile: null; error: NextResponse };

/**
 * API 라우트 가드 — 승인(approved) 사용자만 통과.
 * 승인 게이트 3계층 중 2계층(API): 프론트/미들웨어를 우회해도 여기서 차단된다.
 */
export async function requireApproved(): Promise<GuardResult> {
  const { profile } = await getSessionProfile();
  if (!profile) {
    return {
      profile: null,
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }
  if (profile.status !== "approved") {
    return {
      profile: null,
      error: NextResponse.json({ error: "승인 대기 중인 계정입니다." }, { status: 403 }),
    };
  }
  return { profile, error: null };
}

/** API 라우트 가드 — 승인된 admin만 통과 */
export async function requireAdmin(): Promise<GuardResult> {
  const result = await requireApproved();
  if (result.error) return result;
  if (result.profile.role !== "admin") {
    return {
      profile: null,
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }
  return result;
}
