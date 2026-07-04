"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { GradingPoller } from "@/components/exams/grading-poller"
import type { MyResultView } from "@/components/exams/detail-types"

function GradingState({
  status,
}: {
  status: "pending" | "grading" | "failed"
}) {
  if (status === "failed") {
    return (
      <p className="text-sm text-muted-foreground">
        AI 채점에 실패했습니다. 관리자가 곧 확인할 예정입니다.
      </p>
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      채점 중 — AI 1차 채점이 진행되고 있습니다. 잠시 후 자동으로 갱신됩니다.
    </p>
  )
}

/** 본인 결과 섹션: 문항별 내 답안 + AI 초안/관리자 확정 점수 + 이의제기 버튼. */
function OwnResult({ result }: { result: MyResultView }) {
  const router = useRouter()
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const { submission, answers } = result
  const isGrading =
    submission.grading_status === "pending" || submission.grading_status === "grading"

  const fileDispute = async (answerId: string) => {
    setPendingId(answerId)
    try {
      const res = await fetch(`/api/answers/${answerId}/disputes`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "이의제기 등록에 실패했습니다.")
        return
      }
      toast.success("이의제기를 등록했습니다. 아래 토론에서 확인하세요.")
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <GradingPoller active={isGrading} />
      <h2 className="text-xl">내 결과</h2>
      <div className="flex flex-col gap-4">
        {answers
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((a, i) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-3 text-base">
                  <span>
                    {i + 1}. {a.question_text}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    배점 {a.max_score}점
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
                  {a.answer_text || (
                    <span className="text-muted-foreground">제출된 답안이 없습니다.</span>
                  )}
                </div>

                {submission.grading_status !== "completed" ? (
                  <GradingState
                    status={submission.grading_status === "failed" ? "failed" : "pending"}
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">AI 초안 {a.ai_score ?? "—"}점</Badge>
                      {a.resolved_at && a.final_score !== null && (
                        <Badge>확정 {a.final_score}점</Badge>
                      )}
                    </div>
                    {a.ai_rationale && (
                      <p className="rounded-lg bg-band-lavender p-3 text-sm text-muted-foreground">
                        {a.ai_rationale}
                      </p>
                    )}
                    {!a.hasOpenDispute && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="self-start"
                        disabled={pendingId === a.id}
                        onClick={() => fileDispute(a.id)}
                      >
                        이의제기
                      </Button>
                    )}
                    {a.hasOpenDispute && (
                      <p className="text-xs text-muted-foreground">
                        이의제기가 진행 중입니다 — 아래 토론에서 확인하세요.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
    </section>
  )
}

export { OwnResult }
