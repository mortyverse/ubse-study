import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { hasEnvVars } from "@/lib/utils"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // env가 아직 없으면(.env.local 미작성) proxy 검증을 건너뛴다.
  if (!hasEnvVars) {
    return supabaseResponse
  }

  // Fluid compute를 쓸 경우 전역 변수에 두지 말고 요청마다 새로 생성한다.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // createServerClient와 getClaims() 사이에 다른 코드를 넣지 말 것.
  // 사소한 실수로도 사용자가 무작위로 로그아웃되는 디버깅하기 어려운
  // 문제가 생길 수 있다. getClaims()를 제거해도 같은 문제가 생긴다.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // supabaseResponse를 반드시 그대로 반환할 것. 새 NextResponse를
  // 만들어야 한다면 request를 전달하고 cookies를 복사한 뒤 반환한다 —
  // 그러지 않으면 브라우저/서버 세션이 어긋나 조기 로그아웃된다.
  return supabaseResponse
}
