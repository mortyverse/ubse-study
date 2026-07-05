import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — 버킷 file_size_limit(0016)과 일치
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "ppt", "pptx", "key", "zip", "md", "txt",
  "png", "jpg", "jpeg", "webp", "gif",
]);

/**
 * 강의자료 업로드 토큰 발급 (admin 전용 — PRD §4.5).
 * 파일 본문은 받지 않는다 — Vercel 함수의 본문 ~4.5MB 제한 때문에 브라우저가
 * signed upload URL로 Storage에 직접 올린다 (src/lib/storage-upload.ts).
 * 여기서는 admin 검증 + 확장자/크기 사전 검사 + 서버 생성 경로만 책임지고,
 * 실제 용량 강제는 버킷 file_size_limit이 Storage 서버에서 수행한다.
 * 다운로드는 종전대로 승인 멤버가 signed URL로만 받는다.
 */
export async function POST(request: Request) {
  const { error } = await requireAdmin();
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
      { error: "파일 크기는 50MB 이하여야 합니다." },
      { status: 400 },
    );
  }

  const fileName = body.file_name;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: `허용되지 않는 파일 형식입니다. (${[...ALLOWED_EXTENSIONS].join(", ")})` },
      { status: 400 },
    );
  }

  // 경로는 서버가 생성 — Storage 오브젝트 키는 한글 등 비-ASCII를 거부하므로
  // ASCII만 남기고 정규화한다("Invalid key" 500의 원인). 원본 파일명은
  // file_name으로 반환해 게시글에 저장하고 다운로드 시 복원한다.
  const asciiBase = fileName
    .slice(0, fileName.length - extension.length - 1)
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 80);
  const filePath = `${crypto.randomUUID()}/${asciiBase || "file"}.${extension}`;

  const admin = createAdminClient();
  const { data, error: signError } = await admin.storage
    .from("materials")
    .createSignedUploadUrl(filePath);
  if (signError || !data) {
    return NextResponse.json(
      { error: `업로드 준비에 실패했습니다: ${signError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { bucket: "materials", file_path: filePath, token: data.token, file_name: fileName },
    { status: 201 },
  );
}
