"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/common/empty-state"

type Question = {
  id: string
  question_text: string
  max_score: number
  order: number
}

type StartResponse = {
  exam: { id: string; title: string; week_number: number; time_limit_minutes: number }
  questions: Question[]
  submission: { id: string; submitted_at: string | null }
  answers: Array<{ id: string; question_id: string; answer_text: string | null }>
  deadline: string
  serverNow: string
}

const AUTOSAVE_INTERVAL_MS = 20_000
const WARN_THRESHOLD_MS = 60_000

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function formatClock(date: Date) {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
}

/**
 * 응시 화면. 마운트 시 POST start → 이미 제출된 상태면 결과 페이지로 리다이렉트.
 * 서버가 내려준 deadline/serverNow만으로 남은 시간을 계산한다 — localStorage 금지
 * (서버 시간이 유일한 권위, CLAUDE.md 규칙). 20초 자동저장 + blur 저장 + 마감
 * 도달 시 즉시 자동 제출.
 */
function TakeExamView({ examId }: { examId: string }) {
  const router = useRouter()
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: StartResponse; clockOffsetMs: number }
  >({ status: "loading" })
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const [nowTick, setNowTick] = React.useState(() => Date.now())
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const answersRef = React.useRef(answers)
  React.useEffect(() => {
    answersRef.current = answers
  }, [answers])
  const submittingRef = React.useRef(false)
  const savingRef = React.useRef(false)

  // 응시 시작 (idempotent — 이미 시작했으면 기존 상태 반환)
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/exams/${examId}/start`, { method: "POST" })
        const data = (await res.json()) as StartResponse & { error?: string }
        if (cancelled) return
        if (!res.ok) {
          setState({ status: "error", message: data.error ?? "시험을 시작하지 못했습니다." })
          return
        }
        if (data.submission.submitted_at) {
          toast.message("이미 제출된 시험입니다. 결과 페이지로 이동합니다.")
          router.replace(`/exams/${examId}`)
          return
        }
        const clockOffsetMs = new Date(data.serverNow).getTime() - Date.now()
        setAnswers(
          Object.fromEntries(
            data.answers.map((a) => [a.question_id, a.answer_text ?? ""]),
          ),
        )
        setState({ status: "ready", data, clockOffsetMs })
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "네트워크 오류로 시험을 시작하지 못했습니다." })
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // examId만 의존 — 마운트 시 1회 실행 의도
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  const ready = state.status === "ready" ? state : null
  const deadlineMs = ready ? new Date(ready.data.deadline).getTime() : null

  // 1초 tick (표시용 카운트다운)
  React.useEffect(() => {
    if (!deadlineMs) return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadlineMs])

  const currentAnswersPayload = React.useCallback(
    () =>
      Object.entries(answersRef.current).map(([question_id, answer_text]) => ({
        question_id,
        answer_text,
      })),
    [],
  )

  const handleSubmit = React.useCallback(
    async (auto: boolean) => {
      if (submittingRef.current) return
      submittingRef.current = true
      setIsSubmitting(true)
      try {
        const res = await fetch(`/api/exams/${examId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: currentAnswersPayload() }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.message(data.error ?? "이미 처리된 시험입니다.")
          router.replace(`/exams/${examId}`)
          return
        }
        toast.success(
          auto
            ? "제한시간이 종료되어 자동 제출되었습니다."
            : "제출되었습니다.",
        )
        router.replace(`/exams/${examId}`)
      } catch {
        toast.error("네트워크 오류로 제출하지 못했습니다.")
        submittingRef.current = false
        setIsSubmitting(false)
      }
    },
    [examId, currentAnswersPayload, router],
  )

  // 마감 시각에 정확히 자동 제출 예약
  React.useEffect(() => {
    if (!deadlineMs || !ready) return
    const remaining = deadlineMs - (Date.now() + ready.clockOffsetMs)
    const t = setTimeout(() => handleSubmit(true), Math.max(remaining, 0))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineMs])

  const saveAnswers = React.useCallback(async () => {
    if (submittingRef.current || savingRef.current) return
    savingRef.current = true
    try {
      const res = await fetch(`/api/exams/${examId}/answers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: currentAnswersPayload() }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.message(data.error ?? "제출이 마감되었습니다.")
          router.replace(`/exams/${examId}`)
        }
        return
      }
      setLastSavedAt(new Date())
    } catch {
      // 일시적 오류 — 다음 자동저장에서 재시도
    } finally {
      savingRef.current = false
    }
  }, [examId, currentAnswersPayload, router])

  // 20초 간격 자동저장
  React.useEffect(() => {
    if (!ready) return
    const id = setInterval(saveAnswers, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [ready, saveAnswers])

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <Spinner className="size-6" />
        <p className="text-sm text-muted-foreground">시험을 불러오는 중입니다…</p>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <EmptyState title="시험을 시작할 수 없습니다" description={state.message} />
    )
  }

  const { data } = state
  const remainingMs = Math.max(0, deadlineMs! - (nowTick + state.clockOffsetMs))
  const isWarning = remainingMs <= WARN_THRESHOLD_MS
  const sortedQuestions = [...data.questions].sort((a, b) => a.order - b.order)

  return (
    <>
      <div
        className={cn(
          "sticky top-[72px] z-40 -mx-8 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-8 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-lg sm:border sm:px-6",
        )}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
            {data.exam.week_number}주차 · {data.exam.title}
          </span>
          {lastSavedAt && (
            <span className="text-xs text-muted-foreground">
              저장됨 {formatClock(lastSavedAt)}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-mono text-2xl font-bold tabular-nums",
            isWarning ? "text-destructive" : "text-foreground",
          )}
        >
          {formatCountdown(remainingMs)}
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {sortedQuestions.map((q, i) => (
          <Card key={q.id}>
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-3 text-base">
                <span>
                  {i + 1}. {q.question_text}
                </span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  배점 {q.max_score}점
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                onBlur={saveAnswers}
                placeholder="답안을 입력하세요."
                maxLength={20_000}
                className="min-h-40 text-base"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="sticky bottom-4 flex justify-end pt-2">
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button
            type="button"
            size="lg"
            className="min-h-12 shadow-[0_6px_24px_rgba(115,101,166,.28)]"
            onClick={() => setConfirmOpen(true)}
            disabled={isSubmitting}
          >
            제출하기
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>시험을 제출할까요?</DialogTitle>
              <DialogDescription>
                제출 후에는 답안을 수정할 수 없습니다. 채점은 제출 직후 자동으로
                시작됩니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">취소</Button>
              </DialogClose>
              <Button
                onClick={() => {
                  setConfirmOpen(false)
                  handleSubmit(false)
                }}
                disabled={isSubmitting}
              >
                {isSubmitting && <Spinner data-icon="inline-start" />}
                제출 확정
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}

export { TakeExamView }
