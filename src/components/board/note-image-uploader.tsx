"use client"

import * as React from "react"
import { toast } from "sonner"
import { uploadViaSignedUrl } from "@/lib/storage-upload"
import { CameraIcon, Cross2Icon, PlusIcon } from "@radix-ui/react-icons"

import { Spinner } from "@/components/ui/spinner"

const MAX_IMAGES = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif"
const ACCEPT_TYPES = new Set(ACCEPT.split(","))

export type NoteImage = { path: string; url: string }

/**
 * 필기노트 공책 사진 업로더 — 드래그앤드롭/클릭 선택으로 여러 장을 올리고,
 * 썸네일 그리드에서 순서(=표시 순서)와 삭제를 관리한다. 선택 즉시
 * /api/board/notes/upload로 올려 file_path를 확보하고, 미리보기는 로컬
 * objectURL(신규) 또는 signed URL(수정 진입 시)로 보여준다.
 */
function NoteImageUploader({
  images,
  onChange,
  disabled = false,
}: {
  images: NoteImage[]
  onChange: (images: NoteImage[]) => void
  disabled?: boolean
}) {
  const [isUploading, setIsUploading] = React.useState(false)
  const [isDragOver, setIsDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const remaining = MAX_IMAGES - images.length

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (disabled || isUploading) return
    const files = Array.from(fileList).filter((f) => f.size > 0)
    if (files.length === 0) return

    const invalidType = files.find((f) => !ACCEPT_TYPES.has(f.type))
    if (invalidType) {
      toast.error("jpg, png, webp, gif 이미지만 올릴 수 있습니다.")
      return
    }
    const tooBig = files.find((f) => f.size > MAX_FILE_SIZE)
    if (tooBig) {
      toast.error("이미지 크기는 장당 10MB 이하여야 합니다.")
      return
    }
    if (files.length > remaining) {
      toast.error(`사진은 최대 ${MAX_IMAGES}장까지 올릴 수 있습니다. (${remaining}장 더 가능)`)
      return
    }

    setIsUploading(true)
    try {
      const uploaded: NoteImage[] = []
      // 순서 보존을 위해 선택한 순서대로 하나씩 올린다.
      for (const file of files) {
        const result = await uploadViaSignedUrl("/api/board/notes/upload", file)
        if (!result.ok) {
          toast.error(`${file.name}: ${result.error}`)
          continue
        }
        uploaded.push({ path: result.file_path, url: URL.createObjectURL(file) })
      }
      if (uploaded.length > 0) {
        onChange([...images, ...uploaded])
        toast.success(`사진 ${uploaded.length}장을 올렸습니다.`)
      }
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index))
  }

  const openPicker = () => {
    if (!disabled && !isUploading) inputRef.current?.click()
  }

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled && !isUploading && remaining > 0) setIsDragOver(true)
    },
    onDragLeave: () => setIsDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (remaining > 0) void uploadFiles(e.dataTransfer.files)
    },
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
      />

      {images.length === 0 ? (
        /* 첫 업로드 — 큰 드롭존 하나로 시선을 모은다 */
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || isUploading}
          {...dropHandlers}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-accent/40"
          }`}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {isUploading ? <Spinner className="size-5" /> : <CameraIcon className="size-6" />}
          </span>
          <span className="text-sm font-medium text-foreground">
            {isUploading
              ? "업로드 중…"
              : "공책 필기 사진을 끌어다 놓거나, 클릭해서 선택하세요"}
          </span>
          <span className="text-sm text-muted-foreground">
            jpg · png · webp · gif — 장당 10MB, 최대 {MAX_IMAGES}장
          </span>
        </button>
      ) : (
        <>
          {/* 썸네일 그리드 — 배열 순서가 노트의 페이지 순서 */}
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
            {...dropHandlers}
          >
            {images.map((img, i) => (
              <div
                key={img.path}
                className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 objectURL/단기 signed URL 미리보기 */}
                <img
                  src={img.url}
                  alt={`필기 사진 ${i + 1}`}
                  className="size-full object-cover"
                />
                <span className="absolute top-2 left-2 rounded-full bg-foreground/70 px-2 py-0.5 text-xs font-medium text-white">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`${i + 1}번째 사진 제거`}
                  className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-white/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-white focus-visible:opacity-100"
                >
                  <Cross2Icon className="size-3.5" />
                </button>
              </div>
            ))}

            {remaining > 0 && (
              <button
                type="button"
                onClick={openPicker}
                disabled={disabled || isUploading}
                className={`flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-muted-foreground transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/50 hover:text-primary"
                }`}
              >
                {isUploading ? <Spinner className="size-5" /> : <PlusIcon className="size-5" />}
                <span className="text-sm font-medium">
                  {isUploading ? "업로드 중…" : "사진 추가"}
                </span>
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {images.length}/{MAX_IMAGES}장 · 번호 순서대로 노트에 표시됩니다.
          </p>
        </>
      )}
    </div>
  )
}

export { NoteImageUploader, MAX_IMAGES }
