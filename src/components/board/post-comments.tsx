"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { TrashIcon } from "@radix-ui/react-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/common/empty-state"
import type { BoardCommentView } from "@/components/board/types"

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** 댓글 목록 + 작성 + 본인 댓글 삭제 (PRD §4.5). */
function PostComments({
  postId,
  initialComments,
  viewerId,
}: {
  postId: string
  initialComments: BoardCommentView[]
  viewerId: string
}) {
  const router = useRouter()
  const [content, setContent] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/board/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, content }),
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
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    setDeletingId(commentId)
    try {
      const res = await fetch(`/api/board/comments/${commentId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "삭제에 실패했습니다.")
        return
      }
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl">댓글 {initialComments.length > 0 && initialComments.length}</h2>

      {initialComments.length === 0 ? (
        <EmptyState title="아직 댓글이 없습니다" description="첫 댓글을 남겨 보세요." className="py-10" />
      ) : (
        <div className="flex flex-col gap-4">
          {initialComments.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <Avatar size="sm">
                <AvatarImage
                  src={c.users?.avatar_url ?? undefined}
                  alt={c.users?.display_name ?? "알 수 없음"}
                />
                <AvatarFallback>
                  {(c.users?.display_name ?? "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {c.users?.display_name ?? "알 수 없음"}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {formatDateTime(c.created_at)}
                    </span>
                  </span>
                  {c.author_id === viewerId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      aria-label="댓글 삭제"
                    >
                      <TrashIcon />
                    </Button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap text-foreground">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="댓글을 남겨주세요."
          maxLength={5000}
          className="min-h-10 flex-1"
        />
        {/* 화면당 violet 1개 규칙 유지 — 상세 페이지 상단의 게시글 액션이 outline이므로
            여기는 outline을 사용한다 (primary는 목록 탭의 글쓰기 버튼). */}
        <Button
          type="submit"
          variant="outline"
          disabled={isSubmitting || !content.trim()}
          className="sm:self-end"
        >
          댓글 등록
        </Button>
      </form>
    </section>
  )
}

export { PostComments }
