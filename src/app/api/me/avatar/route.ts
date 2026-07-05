import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — 버킷 file_size_limit(0016)과 일치
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/**
 * 프로필 사진 업로드 (PRD §4.4 확장) — 2단계.
 * POST: signed upload URL 토큰 발급 (파일 본문은 Vercel 함수 본문 제한 때문에
 *       받지 않는다 — 브라우저가 public 버킷 'avatars'에 직접 업로드).
 * PATCH: 업로드 완료 확인 후 users.avatar_url을 공개 URL로 갱신.
 * 안전장치: 경로 접두사 = 본인 user id, 용량·mime은 버킷 설정(0016)이
 * Storage 서버에서 강제(이미지 mime만 허용 — public 버킷 방어).
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
      { error: "프로필 사진은 5MB 이하여야 합니다." },
      { status: 400 },
    );
  }

  const extension = (body.file_name as string).split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "jpg, png, webp, gif 이미지만 올릴 수 있습니다." },
      { status: 400 },
    );
  }

  const filePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;

  const admin = createAdminClient();
  const { data, error: signError } = await admin.storage
    .from("avatars")
    .createSignedUploadUrl(filePath);
  if (signError || !data) {
    return NextResponse.json(
      { error: `업로드 준비에 실패했습니다: ${signError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { bucket: "avatars", file_path: filePath, token: data.token },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const { profile, error } = await requireApproved();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    file_path?: unknown;
  } | null;
  const filePath = typeof body?.file_path === "string" ? body.file_path : null;
  // 본인 접두사 경로만 인정 — 타인 오브젝트를 자기 아바타로 가리키는 것 방지
  if (!filePath || !filePath.startsWith(`${profile.id}/`) || filePath.includes("..")) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const admin = createAdminClient();
  // 실제 업로드가 완료된 오브젝트인지 확인
  const dir = filePath.slice(0, filePath.lastIndexOf("/"));
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);
  const { data: objects, error: listError } = await admin.storage
    .from("avatars")
    .list(dir, { search: name });
  if (listError || !objects?.some((o) => o.name === name)) {
    return NextResponse.json(
      { error: "업로드된 파일을 찾을 수 없습니다." },
      { status: 400 },
    );
  }

  const { data: publicUrlData } = admin.storage.from("avatars").getPublicUrl(filePath);
  const avatarUrl = publicUrlData.publicUrl;

  const { error: dbError } = await admin
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", profile.id);
  if (dbError) {
    return NextResponse.json({ error: "프로필 사진 저장에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ avatar_url: avatarUrl });
}
