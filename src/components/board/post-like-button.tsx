"use client"

import * as React from "react"
import { HeartIcon, HeartFilledIcon } from "@radix-ui/react-icons"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

/**
 * 필기노트 좋아요 하트 버튼 (PRD §4.5 확장).
 * - 다른 멤버의 노트: 토글 가능 (낙관적 업데이트, 실패 시 롤백)
 * - 본인 노트: 클릭 불가 — 받은 하트 수만 보여준다
 * 받은 좋아요 1개 = 랭킹 총점 +1점.
 */
function PostLikeButton({
  postId,
  initialCount,
  initialLiked,
  isAuthor,
}: {
  postId: string
  initialCount: number
  initialLiked: boolean
  isAuthor: boolean
}) {
  const [count, setCount] = React.useState(initialCount)
  const [liked, setLiked] = React.useState(initialLiked)
  const [pending, setPending] = React.useState(false)

  const toggle = async () => {
    if (pending) return
    const prev = { count, liked }
    setLiked(!liked)
    setCount((c) => (liked ? c - 1 : c + 1))
    setPending(true)
    try {
      const res = await fetch(`/api/board/posts/${postId}/like`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        setLiked(prev.liked)
        setCount(prev.count)
        toast.error(data.error ?? "좋아요 처리에 실패했습니다.")
        return
      }
      setLiked(data.liked)
      setCount(data.like_count)
    } catch {
      setLiked(prev.liked)
      setCount(prev.count)
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setPending(false)
    }
  }

  if (isAuthor) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground"
        title="내 노트가 받은 좋아요"
      >
        <HeartFilledIcon className="text-destructive/70" />
        {count}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "좋아요 취소" : "좋아요"}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        liked
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        pending && "opacity-60",
      )}
    >
      {liked ? <HeartFilledIcon /> : <HeartIcon />}
      {count}
    </button>
  )
}

export { PostLikeButton }
