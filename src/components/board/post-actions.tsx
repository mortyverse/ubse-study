"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil2Icon, TrashIcon } from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"

/** 게시글 수정/삭제 버튼 — 본인 글(강의자료는 admin)에게만 렌더링된다. */
function PostActions({
  postId,
  category,
}: {
  postId: string
  category: string
}) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = React.useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/board/posts/${postId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "삭제에 실패했습니다.")
        return
      }
      toast.success("게시글을 삭제했습니다.")
      router.push(`/board?tab=${category}`)
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button asChild variant="outline">
        <Link href={`/board/${postId}/edit`}>
          <Pencil2Icon data-icon="inline-start" /> 수정
        </Link>
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">
            <TrashIcon data-icon="inline-start" /> 삭제
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>게시글을 삭제할까요?</DialogTitle>
            <DialogDescription>
              삭제한 게시글과 첨부 파일, 댓글은 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Spinner data-icon="inline-start" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { PostActions }
