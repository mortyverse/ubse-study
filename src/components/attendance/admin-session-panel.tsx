"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import type { SessionMeta } from "@/components/attendance/types"

const WEEK_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1)
const DURATION_OPTIONS = [1, 2, 3, 4, 5]

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/**
 * 관리자 전용 출석 세션 컨트롤.
 * - 세션 없음: 주차/시간 선택 + 출석 시작
 * - 세션 진행 중: 프로젝터용 초대형 코드 + 실시간 카운트다운 (코드는 이 컴포넌트 로컬 state에만 존재)
 */
function AdminSessionPanel({
  session,
  onStarted,
}: {
  session: SessionMeta
  onStarted: (session: NonNullable<SessionMeta>) => void
}) {
  const [week, setWeek] = React.useState("1")
  const [duration, setDuration] = React.useState("3")
  const [isPending, setIsPending] = React.useState(false)
  const [code, setCode] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!session) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [session])

  // 새로고침 등으로 이미 활성 세션 상태로 마운트된 경우 코드만 별도로 조회한다
  // (GET /api/attendance/sessions는 code를 절대 내려주지 않는다).
  // 세션이 없으면 아래 렌더링이 이 코드값을 쓰지 않으므로 별도 초기화가 필요 없다.
  React.useEffect(() => {
    if (!session) return
    let cancelled = false
    fetch(`/api/attendance/sessions/${session.id}/code`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.session?.code) setCode(data.session.code)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session])

  const handleStart = async () => {
    setIsPending(true)
    try {
      const res = await fetch("/api/attendance/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_number: Number(week),
          duration_minutes: Number(duration),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "출석 세션을 시작하지 못했습니다.")
        return
      }
      setCode(data.session.code as string)
      onStarted({
        id: data.session.id,
        week_number: data.session.week_number,
        duration_minutes: data.session.duration_minutes,
        opened_at: data.session.opened_at,
        closes_at: data.session.closes_at,
        is_active: data.session.is_active,
      })
      toast.success("출석 세션을 시작했습니다.")
    } catch {
      toast.error("네트워크 오류로 세션을 시작하지 못했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  if (session) {
    const remaining = new Date(session.closes_at).getTime() - now
    return (
      <Card className="items-center bg-card py-12 text-center shadow-[6px_6px_0_var(--primary)]">
        <CardContent className="flex flex-col items-center gap-4">
          <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {session.week_number}주차 출석 코드
          </span>
          <span className="font-mono text-7xl leading-none font-bold tracking-[0.25em] text-primary tabular-nums sm:text-8xl">
            {code ?? "····"}
          </span>
          <span className="font-mono text-lg text-muted-foreground tabular-nums">
            {remaining > 0 ? formatCountdown(remaining) : "00:00"} 남음
          </span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>출석 세션 시작</CardTitle>
        <CardDescription>
          주차와 출석 가능 시간을 지정하고 세션을 시작하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-muted-foreground">주차</label>
          <Select value={week} onValueChange={setWeek}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_OPTIONS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w}주차
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-muted-foreground">시간</label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}분
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleStart} disabled={isPending}>
          {isPending && <Spinner data-icon="inline-start" />}
          출석 시작
        </Button>
      </CardContent>
    </Card>
  )
}

export { AdminSessionPanel }
