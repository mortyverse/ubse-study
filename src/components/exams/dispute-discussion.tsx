"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/common/empty-state"
import type { DisputeView } from "@/components/exams/detail-types"

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function CommentForm({ disputeId }: { disputeId: string }) {
  const router = useRouter()
  const [content, setContent] = React.useState("")
  const [isPending, setIsPending] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || isPending) return
    setIsPending(true)
    try {
      const res = await fetch(`/api/disputes/${disputeId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "댓글 등록에 실패했습니다.")
        return
      }
      setContent("")
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="의견을 남겨주세요."
        maxLength={5000}
        className="min-h-10 flex-1"
      />
      {/* 이 버튼은 토론마다(카드마다) 반복 렌더링되므로 화면당 violet 1개 규칙을
          지키기 위해 outline을 쓴다 — primary는 페이지당 단 하나만. */}
      <Button
        type="submit"
        variant="outline"
        disabled={isPending || !content.trim()}
        className="sm:self-end"
      >
        댓글 등록
      </Button>
    </form>
  )
}

function DisputeCard({ dispute }: { dispute: DisputeView }) {
  const { answer } = dispute
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarImage
                src={answer.owner.avatar_url ?? undefined}
                alt={answer.owner.display_name}
              />
              <AvatarFallback>{answer.owner.display_name.charAt(0)}</AvatarFallback>
            </Avatar>
            {answer.owner.display_name}
          </span>
          <Badge variant={dispute.status === "open" ? "secondary" : "outline"}>
            {dispute.status === "open" ? "진행 중" : "해결됨"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground">
          {answer.question_text ?? (
            <span className="text-muted-foreground">
              문항 정보는 응시 후 열람할 수 있습니다.
            </span>
          )}
        </p>
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
          {answer.answer_text || (
            <span className="text-muted-foreground">제출된 답안이 없습니다.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            AI 초안 {answer.ai_score ?? "—"}
            {answer.max_score !== null ? ` / ${answer.max_score}` : ""}점
          </Badge>
          {answer.resolved_at && answer.final_score !== null && (
            <Badge>확정 {answer.final_score}점</Badge>
          )}
        </div>
        {answer.ai_rationale && (
          <p className="rounded-lg bg-band-lavender p-3 text-sm text-muted-foreground">
            {answer.ai_rationale}
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {dispute.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 댓글이 없습니다.</p>
          ) : (
            dispute.comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <Avatar size="sm">
                  <AvatarImage src={c.author.avatar_url ?? undefined} alt={c.author.display_name} />
                  <AvatarFallback>{c.author.display_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {c.author.display_name}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {formatDateTime(c.created_at)}
                    </span>
                  </span>
                  <p className="text-sm whitespace-pre-wrap text-foreground">{c.content}</p>
                </div>
              </div>
            ))
          )}
          <CommentForm disputeId={dispute.id} />
        </div>
      </CardContent>
    </Card>
  )
}

/** 이의제기 토론 섹션 — 이 시험을 응시하지 않은 멤버도 볼 수 있다 (PRD §4.2 step 4). */
function DisputeDiscussion({ disputes }: { disputes: DisputeView[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl">이의제기 토론</h2>
      {disputes.length === 0 ? (
        <EmptyState
          title="등록된 이의제기가 없습니다"
          description="채점 결과에 이의가 있으면 본인 답안에서 이의제기를 등록할 수 있습니다."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {disputes.map((d) => (
            <DisputeCard key={d.id} dispute={d} />
          ))}
        </div>
      )}
    </section>
  )
}

export { DisputeDiscussion }
