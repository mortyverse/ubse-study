import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "ppt", "pptx", "key", "zip", "md", "txt",
  "png", "jpg", "jpeg", "webp", "gif",
]);

/**
 * 강의자료 파일 업로드 (admin 전용 — PRD §4.5).
 * private 버킷 'materials'에 service role로 저장하고 file_path를 반환한다.
 * 이 file_path를 강의자료 글 작성(POST /api/board/posts)에 연결한다.
 * 다운로드는 승인 멤버가 signed URL로만 받는다.
 */
export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "파일 크기는 20MB 이하여야 합니다." },
      { status: 400 },
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: `허용되지 않는 파일 형식입니다. (${[...ALLOWED_EXTENSIONS].join(", ")})` },
      { status: 400 },
    );
  }

  // 경로는 서버가 생성 — Storage 오브젝트 키는 한글 등 비-ASCII를 거부하므로
  // ASCII만 남기고 정규화한다("Invalid key" 500의 원인). 원본 파일명은
  // file_name으로 반환해 게시글에 저장하고 다운로드 시 복원한다.
  const asciiBase = file.name
    .slice(0, file.name.length - extension.length - 1)
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 80);
  const filePath = `${crypto.randomUUID()}/${asciiBase || "file"}.${extension}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("materials")
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
  return NextResponse.json(
    { file_path: filePath, file_name: file.name },
    { status: 201 },
  );
}
