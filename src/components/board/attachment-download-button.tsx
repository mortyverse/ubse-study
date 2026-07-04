"use client"

import * as React from "react"
import { toast } from "sonner"
import { DownloadIcon } from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** 강의자료 첨부 다운로드 — 60초 signed URL을 받아 이동한다 (private 버킷). */
function AttachmentDownloadButton({ postId }: { postId: string }) {
  const [isPending, setIsPending] = React.useState(false)

  const handleDownload = async () => {
    setIsPending(true)
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
      setIsPending(false)
    }
  }

  return (
    <Button type="button" variant="outline" onClick={handleDownload} disabled={isPending}>
      {isPending ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
      첨부 파일 다운로드
    </Button>
  )
}

export { AttachmentDownloadButton }
