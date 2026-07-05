"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * next-themes 래퍼 — .dark 클래스 토글 (globals.css의 다크 토큰과 연결).
 * 시스템 설정과 무관하게 기본은 라이트 — 토글로 고른 값만 저장/적용된다.
 */
function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
