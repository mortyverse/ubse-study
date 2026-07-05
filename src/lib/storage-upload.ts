import { createClient } from "@/lib/supabase/client"

type SignedUploadIssue = {
  bucket: string
  file_path: string
  token: string
}

type UploadResult =
  | { ok: true; file_path: string; file_name: string }
  | { ok: false; error: string }

/**
 * 대용량 대응 업로드 (브라우저 전용).
 * 1) 발급 라우트(POST endpoint)에 파일 메타(JSON)를 보내 signed upload URL
 *    토큰을 받는다 — 권한/확장자 검증은 서버가 여기서 수행한다.
 * 2) 브라우저가 Supabase Storage로 직접 업로드한다 — 파일이 Vercel 함수
 *    (본문 ~4.5MB 제한)를 거치지 않으므로 대용량이 가능하다. 실제 용량
 *    제한은 버킷 file_size_limit(0016)이 Storage 서버에서 강제한다.
 */
export async function uploadViaSignedUrl(
  endpoint: string,
  file: File,
): Promise<UploadResult> {
  let issued: SignedUploadIssue
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: file.name, file_size: file.size }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? "업로드 준비에 실패했습니다." }
    issued = data as SignedUploadIssue
  } catch {
    return { ok: false, error: "네트워크 오류가 발생했습니다." }
  }

  const supabase = createClient()
  const { error } = await supabase.storage
    .from(issued.bucket)
    .uploadToSignedUrl(issued.file_path, issued.token, file, {
      contentType: file.type || "application/octet-stream",
    })
  if (error) {
    const message = /exceeded|maximum|too large|413/i.test(error.message)
      ? "파일이 허용 용량을 초과합니다."
      : `업로드에 실패했습니다: ${error.message}`
    return { ok: false, error: message }
  }
  return { ok: true, file_path: issued.file_path, file_name: file.name }
}
