import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (사진 1장 기준)
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/**
 * 필기노트 이미지 업로드 (승인 멤버 전용 — PRD §4.5 확장).
 * 공책 필기 사진을 private 버킷 'notes'에 service role로 저장하고
 * file_path를 반환한다. 경로 접두사를 업로더의 user id로 강제해,
 * 게시글 연결(POST/PATCH /api/board/posts)에서 소유권을 접두사로 검증한다.
 * 표시는 상세 페이지가 서버에서 발급하는 signed URL로만 이루어진다.
 */
export async function POST(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "이미지 크기는 장당 10MB 이하여야 합니다." },
      { status: 400 },
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "jpg, png, webp, gif 이미지만 올릴 수 있습니다." },
      { status: 400 },
    );
  }

  // Storage 오브젝트 키는 비-ASCII를 거부하므로 ASCII로 정규화한다
  // (materials 업로드와 동일한 규칙 — "Invalid key" 500 방지).
  const asciiBase = file.name
    .slice(0, file.name.length - extension.length - 1)
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 80);
  const filePath = `${profile.id}/${crypto.randomUUID()}/${asciiBase || "note"}.${extension}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("notes")
    .upload(filePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `업로드에 실패했습니다: ${uploadError.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ file_path: filePath }, { status: 201 });
}
