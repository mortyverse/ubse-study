"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"

const emptySubscribe = () => () => {}

/** 라이트/다크 토글 — 마운트 전에는 자리만 잡아 hydration 불일치를 피한다. */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // SSR에서는 false, 클라이언트에서는 true — effect+setState 없이 마운트를 감지한다
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-hidden className="invisible" />
  }

  const isDark = resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </Button>
  )
}

export { ThemeToggle }
