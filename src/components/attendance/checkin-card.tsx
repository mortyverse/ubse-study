"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import type { MyRecord, SessionMeta } from "@/components/attendance/types"

function formatCheckedAt(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * 멤버 본인 출석 체크 카드.
 * - 이미 출석/지각 처리됐으면 담담한 확인 문구만 보여준다.
 * - 아니면 4자리 코드 입력 — 엄지로 누르기 쉬운 큰 인풋 + 큰 버튼.
 */
function CheckinCard({
  session,
  myRecord,
  onChecked,
}: {
  session: NonNullable<SessionMeta>
  myRecord: MyRecord
  onChecked: (record: NonNullable<MyRecord>) => void
}) {
  const [code, setCode] = React.useState("")
  const [isPending, setIsPending] = React.useState(false)

  const alreadyChecked = Boolean(myRecord && myRecord.status !== "absent")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 4) return
    setIsPending(true)
    try {
      const res = await fetch("/api/attendance/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "출석 처리에 실패했습니다.")
        return
      }
      toast.success("출석 처리되었습니다.")
      onChecked(data.record)
      setCode("")
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{session.week_number}주차 출석 체크</CardTitle>
        {!alreadyChecked && (
          <CardDescription>관리자가 안내한 4자리 코드를 입력해 주세요.</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {alreadyChecked ? (
          <p className="text-base text-foreground">
            출석 완료
            {myRecord?.checked_at && (
              <span className="text-muted-foreground">
                {" "}
                · {formatCheckedAt(myRecord.checked_at)} 체크인
              </span>
            )}
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
          >
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
              placeholder="0000"
              aria-label="출석 코드"
              className="h-14 min-h-12 w-full rounded-lg text-center font-mono text-2xl tracking-[0.4em] sm:w-40"
            />
            <Button
              type="submit"
              size="lg"
              className="min-h-12 sm:w-32"
              disabled={isPending || code.length !== 4}
            >
              출석하기
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export { CheckinCard }
