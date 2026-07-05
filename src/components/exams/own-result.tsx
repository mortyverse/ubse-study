"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GradingPoller } from "@/components/exams/grading-poller"
import type { MyResultView } from "@/components/exams/detail-types"

type GradeState = "correct" | "partial" | "wrong"

/** 확정 점수가 있으면 확정, 없으면 AI 초안 기준으로 정답/부분/오답 판정 */
function gradeStateOf(
  score: number | null,
  maxScore: number,
): GradeState | null {
  if (score === null) return null
  if (score <= 0) return "wrong"
  if (score >= maxScore) return "correct"
  return "partial"
}

// 시맨틱 상태색 (헌법): 정답 sage-green(success) · 부분 amber(warning) · 오답 rose(destructive)
// 카드 테두리는 틀린 문항에만 은은하게 — 정답은 기본 카드 그대로(표시 없음),
// 부분 점수는 연한 주황, 오답은 연한 빨강 전체 테두리.
const GRADE_TONE: Record<
  GradeState,
  { card: string; pill: string; label: string }
> = {
  correct: {
    card: "",
    pill: "bg-success/15 text-[color-mix(in_srgb,var(--success)_75%,var(--foreground))]",
    label: "정답",
  },
  partial: {
    card: "border-warning/40",
    pill: "bg-warning/15 text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]",
    label: "부분 점수",
  },
  wrong: {
    card: "border-destructive/40",
    pill: "bg-destructive/15 text-[color-mix(in_srgb,var(--destructive)_75%,var(--foreground))]",
    label: "오답",
  },
}

const GRADE_PILL_BASE =
  "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"

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
    submission.grading_status === "pending" ||
    submission.grading_status === "grading"

  const fileDispute = async (answerId: string) => {
    setPendingId(answerId)
    try {
      const res = await fetch(`/api/answers/${answerId}/disputes`, {
        method: "POST",
      })
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
          .map((a, i) => {
            // 자동 확정 체제: final_score가 곧 확정 점수 (이의제기 중엔 null →
            // AI 초안을 참고용으로 표시)
            const effectiveScore = a.final_score ?? a.ai_score
            const gradeState =
              submission.grading_status === "completed"
                ? gradeStateOf(effectiveScore, a.max_score)
                : null
            return (
              <Card
                key={a.id}
                className={cn(gradeState && GRADE_TONE[gradeState].card)}
              >
                <CardHeader>
                  <CardTitle className="flex items-baseline justify-between gap-3 text-base">
                    <span>
                      {i + 1}. {a.question_text}
                    </span>
                    <span className="shrink-0 text-sm font-normal text-muted-foreground">
                      배점 {a.max_score}점
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
                    {a.answer_text || (
                      <span className="text-muted-foreground">
                        제출된 답안이 없습니다.
                      </span>
                    )}
                  </div>

                  {submission.grading_status !== "completed" ? (
                    <GradingState
                      status={
                        submission.grading_status === "failed"
                          ? "failed"
                          : "pending"
                      }
                    />
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {gradeState && (
                          <span
                            className={cn(
                              GRADE_PILL_BASE,
                              GRADE_TONE[gradeState].pill,
                            )}
                          >
                            {GRADE_TONE[gradeState].label} · {effectiveScore}/
                            {a.max_score}점
                          </span>
                        )}
                        <Badge variant="outline">
                          AI 초안 {a.ai_score ?? "—"}점
                        </Badge>
                        {a.resolved_at && a.final_score !== null && (
                          <Badge>관리자 확정 {a.final_score}점</Badge>
                        )}
                        {a.hasOpenDispute && (
                          <Badge variant="outline" className="border-warning/50 text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]">
                            재검토 중
                          </Badge>
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
                        <p className="text-sm text-muted-foreground">
                          이의제기가 진행 중입니다 — 아래 토론에서 확인하세요.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
      </div>
    </section>
  )
}

export { OwnResult }
