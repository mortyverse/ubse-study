import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUser, BoardPost } from "@/lib/types";

const MAX_CONTENT = 50_000;

/**
 * 수정/삭제 권한 (PRD §4.5): 자유게시판·필기노트 = 작성자 본인만,
 * 강의자료 = admin만. (admin이라도 타인의 자유글/노트는 건드릴 수 없다)
 */
function canModify(post: BoardPost, profile: AppUser): boolean {
  if (post.category === "material") return profile.role === "admin";
  return post.author_id === profile.id;
}

async function loadPost(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("board_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return { admin, post: data as BoardPost | null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id } = await params;
  const { admin, post } = await loadPost(id);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canModify(post, profile)) {
    return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    content_markdown?: unknown;
    link_url?: unknown;
    week_number?: unknown;
    file_path?: unknown;
    file_name?: unknown;
    image_paths?: unknown;
  } | null;

  const updates: Record<string, unknown> = {};
  if (body?.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title === "" || title.length > 200) {
      return NextResponse.json({ error: "제목은 1–200자여야 합니다." }, { status: 400 });
    }
    updates.title = title;
  }
  if (body?.content_markdown !== undefined) {
    if (
      body.content_markdown !== null &&
      (typeof body.content_markdown !== "string" ||
        body.content_markdown.length > MAX_CONTENT)
    ) {
      return NextResponse.json(
        { error: `본문은 ${MAX_CONTENT}자 이내여야 합니다.` },
        { status: 400 },
      );
    }
    updates.content_markdown = body.content_markdown;
  }
  if (body?.link_url !== undefined) {
    if (body.link_url === null || body.link_url === "") {
      updates.link_url = null;
    } else if (typeof body.link_url === "string" && body.link_url.length <= 500) {
      try {
        const parsed = new URL(body.link_url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
        updates.link_url = body.link_url;
      } catch {
        return NextResponse.json({ error: "링크 형식이 올바르지 않습니다." }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "링크 형식이 올바르지 않습니다." }, { status: 400 });
    }
  }
  if (body?.week_number !== undefined) {
    if (body.week_number === null) {
      updates.week_number = null;
    } else if (
      post.category === "material" &&
      typeof body.week_number === "number" &&
      Number.isInteger(body.week_number) &&
      body.week_number >= 1 &&
      body.week_number <= 10
    ) {
      updates.week_number = body.week_number;
    } else {
      return NextResponse.json(
        { error: "week_number는 강의자료에서만, 1–10 정수로 지정할 수 있습니다." },
        { status: 400 },
      );
    }
  }

  if (body?.file_path !== undefined) {
    if (body.file_path === null || body.file_path === "") {
      updates.file_path = null;
      updates.file_name = null;
    } else if (
      post.category === "material" &&
      typeof body.file_path === "string" &&
      body.file_path.length <= 300 &&
      !body.file_path.includes("..")
    ) {
      updates.file_path = body.file_path;
      // 원본 파일명(표시/다운로드용) — 첨부와 함께 갱신
      if (body.file_name !== undefined && body.file_name !== null && body.file_name !== "") {
        if (typeof body.file_name !== "string" || body.file_name.length > 200) {
          return NextResponse.json(
            { error: "file_name은 200자 이내여야 합니다." },
            { status: 400 },
          );
        }
        updates.file_name = body.file_name;
      } else if (body.file_path !== post.file_path) {
        updates.file_name = null;
      }
    } else {
      return NextResponse.json(
        { error: "file_path는 강의자료 업로드로 발급된 경로만 사용할 수 있습니다." },
        { status: 400 },
      );
    }
  }

  // 필기노트 이미지 (공책 사진) — 노트 전용, 최대 10장.
  // 소유권은 경로 접두사(`${작성자 id}/`)로 검증한다. canModify를 통과한
  // 시점에서 노트는 profile.id === post.author_id 이므로 profile.id를 쓴다.
  if (body?.image_paths !== undefined && body.image_paths !== null) {
    if (
      post.category !== "note" ||
      !Array.isArray(body.image_paths) ||
      body.image_paths.length > 10 ||
      body.image_paths.some(
        (p) =>
          typeof p !== "string" ||
          p.length > 300 ||
          p.includes("..") ||
          !p.startsWith(`${profile.id}/`),
      )
    ) {
      return NextResponse.json(
        { error: "image_paths는 필기노트에서 본인이 업로드한 이미지(최대 10장)만 연결할 수 있습니다." },
        { status: 400 },
      );
    }
    updates.image_paths = body.image_paths as string[];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
  }

  // 노트 무결성: 수정 결과가 본문도 사진도 없는 빈 노트가 되면 거부한다.
  if (post.category === "note") {
    const nextContent =
      "content_markdown" in updates
        ? (updates.content_markdown as string | null)
        : post.content_markdown;
    const nextImages =
      "image_paths" in updates
        ? (updates.image_paths as string[])
        : (post.image_paths ?? []);
    if ((!nextContent || nextContent.trim() === "") && nextImages.length === 0) {
      return NextResponse.json(
        { error: "필기노트는 본문(마크다운) 또는 필기 사진이 필요합니다." },
        { status: 400 },
      );
    }
  }

  const { data: updated, error: dbError } = await admin
    .from("board_posts")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (dbError || !updated) {
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
  }

  // 첨부 교체/제거 시 이전 파일 정리 — 실패해도 수정은 유지 (고아 파일은 무해)
  const previousPath = post.file_path;
  if (
    "file_path" in updates &&
    previousPath &&
    updates.file_path !== previousPath
  ) {
    await admin.storage.from("materials").remove([previousPath]);
  }

  // 노트 이미지 교체/제거 시 빠진 오브젝트 정리 — 실패해도 수정은 유지
  if ("image_paths" in updates) {
    const nextSet = new Set(updates.image_paths as string[]);
    const removed = (post.image_paths ?? []).filter((p) => !nextSet.has(p));
    if (removed.length > 0) {
      await admin.storage.from("notes").remove(removed);
    }
  }
  return NextResponse.json({ post: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const { id } = await params;
  const { admin, post } = await loadPost(id);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!canModify(post, profile)) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  const { error: dbError } = await admin.from("board_posts").delete().eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }

  // 첨부 파일 정리 (강의자료) — 실패해도 글 삭제는 유지 (고아 파일은 무해)
  if (post.file_path) {
    await admin.storage.from("materials").remove([post.file_path]);
  }
  // 필기노트 이미지 정리
  if (post.image_paths && post.image_paths.length > 0) {
    await admin.storage.from("notes").remove(post.image_paths);
  }
  return NextResponse.json({ deleted: true });
}
