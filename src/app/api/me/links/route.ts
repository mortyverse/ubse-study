import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_URL_LENGTH = 500;

function normalizeUrl(value: unknown, label: string): string | null | { error: string } {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) {
    return { error: `${label}은 ${MAX_URL_LENGTH}자 이내의 URL이어야 합니다.` };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: `${label} 형식이 올바르지 않습니다. (https:// 포함 전체 URL)` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: `${label}은 http(s) URL만 허용됩니다.` };
  }
  return value;
}

/**
 * 본인 프로필 링크 등록/수정 (PRD §4.4 — GitHub/프로젝트 링크, 본인만 수정).
 * 고정 payload: 이 라우트는 github_url/project_url 두 컬럼만, 본인 행만 쓴다.
 * (users에는 member self-UPDATE RLS 정책이 없으므로 이 경로가 유일한 수정 창구)
 */
export async function PATCH(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    github_url?: unknown;
    project_url?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const github = normalizeUrl(body.github_url, "GitHub 링크");
  if (github && typeof github === "object") {
    return NextResponse.json({ error: github.error }, { status: 400 });
  }
  const project = normalizeUrl(body.project_url, "프로젝트 링크");
  if (project && typeof project === "object") {
    return NextResponse.json({ error: project.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error: dbError } = await admin
    .from("users")
    .update({ github_url: github, project_url: project })
    .eq("id", profile.id)
    .select("id, github_url, project_url")
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "링크 저장에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ links: data });
}
