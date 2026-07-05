import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — 버킷 file_size_limit(0016)과 일치
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/**
 * 필기노트 이미지 업로드 토큰 발급 (승인 멤버 전용 — PRD §4.5 확장).
 * 파일 본문은 받지 않는다 — Vercel 함수의 본문 ~4.5MB 제한 때문에 브라우저가
 * signed upload URL로 private 버킷 'notes'에 직접 올린다. 경로 접두사를
 * 업로더의 user id로 강제해, 게시글 연결(POST/PATCH /api/board/posts)에서
 * 소유권을 접두사로 검증한다. 실제 용량 강제는 버킷 file_size_limit.
 * 표시는 상세 페이지가 서버에서 발급하는 signed URL로만 이루어진다.
 */
export async function POST(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    file_name?: unknown;
    file_size?: unknown;
  } | null;
  if (!body || typeof body.file_name !== "string" || body.file_name.length === 0) {
    return NextResponse.json({ error: "file_name이 필요합니다." }, { status: 400 });
  }
  const fileSize = typeof body.file_size === "number" ? body.file_size : 0;
  if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "이미지 크기는 장당 10MB 이하여야 합니다." },
      { status: 400 },
    );
  }

  const fileName = body.file_name;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "jpg, png, webp, gif 이미지만 올릴 수 있습니다." },
      { status: 400 },
    );
  }

  // Storage 오브젝트 키는 비-ASCII를 거부하므로 ASCII로 정규화한다
  // (materials 업로드와 동일한 규칙 — "Invalid key" 500 방지).
  const asciiBase = fileName
    .slice(0, fileName.length - extension.length - 1)
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 80);
  const filePath = `${profile.id}/${crypto.randomUUID()}/${asciiBase || "note"}.${extension}`;

  const admin = createAdminClient();
  const { data, error: signError } = await admin.storage
    .from("notes")
    .createSignedUploadUrl(filePath);
  if (signError || !data) {
    return NextResponse.json(
      { error: `업로드 준비에 실패했습니다: ${signError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { bucket: "notes", file_path: filePath, token: data.token },
    { status: 201 },
  );
}
