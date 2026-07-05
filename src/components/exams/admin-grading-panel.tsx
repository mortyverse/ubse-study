"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { ExamStatusBadge } from "@/components/exams/exam-status-badge"
import { deriveExamStatus } from "@/components/exams/status"
import type { AdminSubmissionView } from "@/components/exams/detail-types"

function AnswerRow({ answerId, answer }: { answerId: string; answer: AdminSubmissionView["answers"][number] }) {
  const router = useRouter()
  const [score, setScore] = React.useState(
    String(answer.final_score ?? answer.ai_score ?? ""),
  )
  const [isPending, setIsPending] = React.useState(false)

  const confirm = async () => {
    const value = Number(score)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("올바른 점수를 입력해 주세요.")
      return
    }
    setIsPending(true)
    try {
      const res = await fetch(`/api/answers/${answerId}/final`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_score: value }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "확정에 실패했습니다.")
        return
      }
      toast.success("최종 점수를 확정했습니다.")
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{answer.question_text}</span>
        <span className="shrink-0 text-sm text-muted-foreground">배점 {answer.max_score}점</span>
      </div>
      <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-sm whitespace-pre-wrap text-foreground">
        {answer.answer_text || (
          <span className="text-muted-foreground">제출된 답안이 없습니다.</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">AI 초안 {answer.ai_score ?? "—"}</Badge>
        {answer.final_score !== null && (
          <Badge>
            확정 {answer.final_score}점{answer.resolved_at ? " · 관리자" : " · 자동"}
          </Badge>
        )}
        {answer.hasOpenDispute && (
          <Badge
            variant="outline"
            className="border-warning/50 text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]"
          >
            이의제기 진행 중
          </Badge>
        )}
      </div>
      {answer.ai_rationale && (
        <p className="rounded-lg bg-band-lavender p-2.5 text-sm text-muted-foreground">
          {answer.ai_rationale}
        </p>
      )}
      {/* 자동 확정 체제: 확정 입력은 이의제기 중이거나 미확정(AI 채점 실패
          구제)인 답안에만 노출 — 나머지는 이미 확정된 상태라 손댈 일이 없다 */}
      {(answer.hasOpenDispute || answer.final_score === null) && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            type="number"
            min={0}
            max={answer.max_score}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="w-24"
          />
          <Button size="sm" variant="outline" disabled={isPending} onClick={confirm}>
            {answer.hasOpenDispute ? "토론 반영 확정" : "확정"}
          </Button>
        </div>
      )}
    </div>
  )
}

/** 관리자 채점 확정 패널 — 전 멤버 제출물을 열람하고 최종 점수를 확정/재확정한다. */
function AdminGradingPanel({ submissions }: { submissions: AdminSubmissionView[] }) {
  if (submissions.length === 0) {
    return null
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-band-peach-light p-6">
      <div>
        <h2 className="text-xl">관리자 채점 확정</h2>
        <p className="text-sm text-muted-foreground">
          AI 채점 결과는 자동으로 확정됩니다. 이의제기가 들어온 문항만 토론 후
          다시 확정하면 됩니다 — 확정 점수만 총점/랭킹에 반영됩니다.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {submissions.map((s) => {
          const status = deriveExamStatus({
            submitted_at: s.submitted_at,
            grading_status: s.grading_status,
          })
          return (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={s.user.avatar_url ?? undefined} alt={s.user.display_name} />
                      <AvatarFallback>{s.user.display_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {s.user.display_name}
                  </span>
                  <ExamStatusBadge status={status} />
                </CardTitle>
                {status !== "completed" && (
                  <CardDescription>채점 완료 후 확정할 수 있습니다.</CardDescription>
                )}
              </CardHeader>
              {status === "completed" && (
                <CardContent>
                  {s.answers
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((a) => (
                      <AnswerRow key={a.id} answerId={a.id} answer={a} />
                    ))}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </section>
  )
}

export { AdminGradingPanel }
