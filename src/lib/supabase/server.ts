import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Fluid compute를 쓸 경우 이 클라이언트를 전역 변수에 두지 말 것.
 * 항상 사용하는 함수 안에서 새로 생성한다.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component에서 호출된 경우 — proxy가 세션을
            // 갱신하고 있다면 무시해도 된다.
          }
        },
      },
    },
  )
}
