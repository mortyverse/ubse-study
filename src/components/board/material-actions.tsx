"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  DotsVerticalIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Pencil2Icon,
  TrashIcon,
} from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

/**
 * 강의자료 목록 행의 인라인 액션(타이틀 옆) — 상세 페이지 없이 목록에서
 * 바로 첨부 다운로드(서명 URL) / 링크 열기.
 */
function MaterialInlineActions({
  postId,
  hasFile,
  linkUrl,
}: {
  postId: string
  hasFile: boolean
  linkUrl: string | null
}) {
  const [isDownloading, setIsDownloading] = React.useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/board/posts/${postId}/download`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "다운로드 URL 발급에 실패했습니다.")
        return
      }
      window.location.href = data.url
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {hasFile && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="첨부 파일 내려받기"
          title="첨부 파일 내려받기"
          onClick={handleDownload}
          disabled={isDownloading}
          className="text-primary hover:text-primary"
        >
          {isDownloading ? <Spinner /> : <DownloadIcon className="size-4.5" />}
        </Button>
      )}
      {linkUrl && (
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label="링크 열기"
          title="링크 열기"
          className="text-muted-foreground hover:text-foreground"
        >
          <Link href={linkUrl} target="_blank" rel="noreferrer">
            <ExternalLinkIcon className="size-4.5" />
          </Link>
        </Button>
      )}
    </div>
  )
}

/**
 * 강의자료 행 우측(날짜 옆)의 admin 전용 ⋮ 메뉴 — 수정/삭제를 접어 넣어
 * 목록을 어지럽히지 않는다. 삭제는 확인 다이얼로그를 거친다.
 */
function MaterialAdminMenu({ postId }: { postId: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
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
      toast.success("자료를 삭제했습니다.")
      setConfirmOpen(false)
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="자료 관리 메뉴"
            title="자료 관리"
            className="text-muted-foreground hover:text-foreground"
          >
            <DotsVerticalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/board/${postId}/edit`}>
              <Pencil2Icon />
              수정
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <TrashIcon />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>자료를 삭제할까요?</DialogTitle>
            <DialogDescription>
              삭제한 자료와 첨부 파일은 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Spinner data-icon="inline-start" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { MaterialInlineActions, MaterialAdminMenu }
