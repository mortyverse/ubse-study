import { NextResponse } from "next/server";
import { getSessionProfile, requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BoardCategory } from "@/lib/types";

const CATEGORIES: BoardCategory[] = ["free", "material", "note"];
const MAX_CONTENT = 50_000;
const MAX_URL = 500;

function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * 게시글 작성 (PRD §4.5).
 * 자유게시판/필기노트 = 승인 멤버 누구나, 강의자료 = admin만.
 * file_path는 강의자료(admin) 업로드 라우트가 발급한 경로만 연결 가능.
 */
export async function POST(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    category?: unknown;
    title?: unknown;
    content_markdown?: unknown;
    link_url?: unknown;
    week_number?: unknown;
    file_path?: unknown;
  } | null;

  const category = body?.category as BoardCategory | undefined;
  if (!category || !CATEGORIES.includes(category)) {
    return invalid("category는 free/material/note 중 하나여야 합니다.");
  }
  // 강의자료는 admin 전용 (PRD §4.5)
  if (category === "material" && profile.role !== "admin") {
    return NextResponse.json(
      { error: "강의자료는 관리자만 작성할 수 있습니다." },
      { status: 403 },
    );
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (title === "" || title.length > 200) {
    return invalid("제목을 입력해 주세요. (200자 이내)");
  }

  const content =
    typeof body?.content_markdown === "string" ? body.content_markdown : null;
  if (content !== null && content.length > MAX_CONTENT) {
    return invalid(`본문은 ${MAX_CONTENT}자 이내여야 합니다.`);
  }
  if (category === "note" && (!content || content.trim() === "")) {
    return invalid("필기노트는 본문(마크다운)이 필요합니다.");
  }

  let linkUrl: string | null = null;
  if (body?.link_url !== undefined && body.link_url !== null && body.link_url !== "") {
    if (typeof body.link_url !== "string" || body.link_url.length > MAX_URL) {
      return invalid(`링크는 ${MAX_URL}자 이내의 URL이어야 합니다.`);
    }
    try {
      const parsed = new URL(body.link_url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      return invalid("링크 형식이 올바르지 않습니다. (https:// 포함 전체 URL)");
    }
    linkUrl = body.link_url;
  }

  let weekNumber: number | null = null;
  if (body?.week_number !== undefined && body.week_number !== null) {
    if (
      category !== "material" ||
      typeof body.week_number !== "number" ||
      !Number.isInteger(body.week_number) ||
      body.week_number < 1 ||
      body.week_number > 10
    ) {
      return invalid("week_number는 강의자료에서만, 1–10 정수로 지정할 수 있습니다.");
    }
    weekNumber = body.week_number;
  }

  let filePath: string | null = null;
  if (body?.file_path !== undefined && body.file_path !== null && body.file_path !== "") {
    if (
      category !== "material" ||
      typeof body.file_path !== "string" ||
      body.file_path.length > 300 ||
      body.file_path.includes("..")
    ) {
      return invalid("file_path는 강의자료 업로드로 발급된 경로만 사용할 수 있습니다.");
    }
    filePath = body.file_path;
  }

  const admin = createAdminClient();
  const { data: post, error: dbError } = await admin
    .from("board_posts")
    .insert({
      category,
      author_id: profile.id,
      title,
      content_markdown: content,
      link_url: linkUrl,
      week_number: weekNumber,
      file_path: filePath,
    })
    .select("*")
    .single();

  if (dbError || !post) {
    return NextResponse.json({ error: "게시글 작성에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ post }, { status: 201 });
}

/** 게시글 목록 — 페이지는 RLS로 직접 조회하지만, 클라이언트 갱신용으로도 제공 */
export async function GET(request: Request) {
  const { error } = await requireApproved();
  if (error) return error;
  await getSessionProfile(); // (guard 재사용으로 이미 검증됨)

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") as BoardCategory | null;
  if (!category || !CATEGORIES.includes(category)) {
    return invalid("category 쿼리가 필요합니다.");
  }

  const admin = createAdminClient();
  const { data: posts } = await admin
    .from("board_posts")
    .select("*, users:author_id(display_name, avatar_url)")
    .eq("category", category)
    .order("created_at", { ascending: false });

  return NextResponse.json({ posts: posts ?? [] });
}
