"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

const POLL_INTERVAL_MS = 10_000

/**
 * 채점 중(pending/grading)인 동안 10초마다 router.refresh()로 서버 데이터를
 * 다시 읽어와 "채점 중" → 완료 전환을 감지한다. 화면에는 아무것도 그리지 않는다.
 */
function GradingPoller({ active }: { active: boolean }) {
  const router = useRouter()

  React.useEffect(() => {
    if (!active) return
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active, router])

  return null
}

export { GradingPoller }
