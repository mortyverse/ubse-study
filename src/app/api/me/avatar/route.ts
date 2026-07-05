import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
// content-type은 클라이언트 값(file.type)을 신뢰하지 않고 검증된 확장자에서
// 유도한다 — public 버킷이라 text/html 등으로 저장되면 스토리지 도메인에서
// 그대로 렌더될 수 있기 때문.
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * 본인 프로필 사진 업로드 (PRD §4.4 확장).
 * public 버킷 'avatars'에 service role로 저장하고(경로 접두사 = 본인 user id),
 * 공개 URL을 users.avatar_url에 반영한다 — avatar_url이 원래 GitHub CDN 공개
 * URL을 담는 컬럼이므로 같은 방식으로 nav/랭킹/게시판 어디서든 그대로 쓰인다.
 * (storage.objects에 authenticated 정책이 없어 직접 업로드는 불가 — 0015 설계)
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
      { error: "프로필 사진은 5MB 이하여야 합니다." },
      { status: 400 },
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXTENSION_CONTENT_TYPES[extension];
  if (!contentType) {
    return NextResponse.json(
      { error: "jpg, png, webp, gif 이미지만 올릴 수 있습니다." },
      { status: 400 },
    );
  }

  const filePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(filePath, file, {
      contentType,
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: `업로드에 실패했습니다: ${uploadError.message}` },
      { status: 500 },
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
  return NextResponse.json({ avatar_url: avatarUrl }, { status: 201 });
}
