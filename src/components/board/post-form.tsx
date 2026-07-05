"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { uploadViaSignedUrl } from "@/lib/storage-upload"
import {
  CameraIcon,
  FileTextIcon,
  Pencil1Icon,
  TrashIcon,
  UploadIcon,
} from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MarkdownEditor } from "@/components/board/markdown-editor"
import {
  NoteImageUploader,
  type NoteImage,
} from "@/components/board/note-image-uploader"
import type { BoardCategory } from "@/lib/types"

const NO_WEEK = "none"

type WeeklyPlanOption = { week_number: number; title: string }

type PostFormInitial = {
  title: string
  content_markdown: string | null
  link_url: string | null
  week_number: number | null
  file_path: string | null
  file_name: string | null
  /** 필기노트 수정 진입 시 기존 사진 (path + 서버 발급 signed URL 미리보기) */
  images?: NoteImage[]
}

/**
 * 게시글 작성/수정 공통 폼 — 카테고리별로 필드 구성만 달라진다 (PRD §4.5).
 * 강의자료 첨부는 작성·수정 모두 지원: /materials/upload로 올린 뒤 발급된
 * file_path를 POST/PATCH에 연결한다. 수정에서 교체·제거하면 서버가 이전
 * 파일을 정리한다.
 */
function PostForm({
  category,
  mode,
  postId,
  initial,
  weeklyPlans = [],
}: {
  category: BoardCategory
  mode: "create" | "edit"
  postId?: string
  initial?: PostFormInitial
  weeklyPlans?: WeeklyPlanOption[]
}) {
  const router = useRouter()
  const [title, setTitle] = React.useState(initial?.title ?? "")
  const [content, setContent] = React.useState(initial?.content_markdown ?? "")
  const [linkUrl, setLinkUrl] = React.useState(initial?.link_url ?? "")
  const [week, setWeek] = React.useState(
    initial?.week_number ? String(initial.week_number) : NO_WEEK,
  )
  const [filePath, setFilePath] = React.useState<string | null>(
    initial?.file_path ?? null,
  )
  const [fileName, setFileName] = React.useState<string | null>(
    initial?.file_name ?? null,
  )
  const [noteImages, setNoteImages] = React.useState<NoteImage[]>(
    initial?.images ?? [],
  )
  const [isUploading, setIsUploading] = React.useState(false)
  const [isPending, setIsPending] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const result = await uploadViaSignedUrl("/api/board/materials/upload", file)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setFilePath(result.file_path)
      setFileName(result.file_name)
      toast.success("파일을 업로드했습니다.")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const removeFile = () => {
    setFilePath(null)
    setFileName(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPending || isUploading) return
    // 필기노트는 마크다운 본문 또는 필기 사진 중 하나는 있어야 한다
    if (
      category === "note" &&
      content.trim() === "" &&
      noteImages.length === 0
    ) {
      toast.error("마크다운 본문을 작성하거나 필기 사진을 올려 주세요.")
      return
    }
    setIsPending(true)

    try {
      const weekNumber = week === NO_WEEK ? null : Number(week)

      let body: Record<string, unknown>
      if (category === "material") {
        body = {
          title,
          link_url: linkUrl.trim() || null,
          week_number: weekNumber,
          file_path: filePath,
          file_name: fileName,
          ...(mode === "create" ? { category } : {}),
        }
      } else if (category === "note") {
        body = {
          title,
          content_markdown: content,
          image_paths: noteImages.map((img) => img.path),
          ...(mode === "create" ? { category } : {}),
        }
      } else {
        body = {
          title,
          content_markdown: content,
          ...(mode === "create" ? { category } : {}),
        }
      }

      const res = await fetch(
        mode === "create" ? "/api/board/posts" : `/api/board/posts/${postId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "저장에 실패했습니다.")
        return
      }

      toast.success(mode === "create" ? "게시글을 등록했습니다." : "게시글을 수정했습니다.")
      const targetId = mode === "create" ? data.post.id : postId
      router.push(mode === "create" ? `/board?tab=${category}` : `/board/${targetId}`)
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>제목</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="post-title">제목</FieldLabel>
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
              required
            />
          </Field>
        </CardContent>
      </Card>

      {category === "material" && (
        <Card>
          <CardHeader>
            <CardTitle>자료 정보</CardTitle>
            <CardDescription>주차, 링크, 첨부 파일은 모두 선택 사항입니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field className="max-w-64">
              <FieldLabel htmlFor="post-week">주차</FieldLabel>
              <Select value={week} onValueChange={setWeek}>
                <SelectTrigger id="post-week" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_WEEK}>선택 안 함</SelectItem>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((w) => {
                    const plan = weeklyPlans.find((p) => p.week_number === w)
                    return (
                      <SelectItem key={w} value={String(w)}>
                        {w}주차{plan ? ` · ${plan.title}` : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="post-link">링크</FieldLabel>
              <Input
                id="post-link"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="post-file">첨부 파일</FieldLabel>
              {filePath ? (
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <FileTextIcon className="text-muted-foreground" />
                  <span className="flex-1 truncate">{fileName ?? "첨부 파일"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={removeFile}
                    aria-label="첨부 파일 제거"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="post-file"
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                  />
                  {isUploading && (
                    <FieldDescription className="flex items-center gap-1.5">
                      <Spinner /> 업로드 중…
                    </FieldDescription>
                  )}
                </>
              )}
              <FieldDescription className="flex items-center gap-1">
                <UploadIcon /> pdf/pptx/zip/md/이미지 등, 50MB 이하
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>
      )}

      {category === "note" && (
        <Card>
          <CardHeader>
            <CardTitle>노트 내용</CardTitle>
            <CardDescription>
              마크다운으로 작성하거나, 공책에 필기했다면 사진으로 올려 보세요.
              두 가지를 함께 써도 됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              defaultValue={
                /* 사진만 있는 노트를 수정할 때는 사진 탭으로 바로 연다 */
                (initial?.images?.length ?? 0) > 0 &&
                (initial?.content_markdown ?? "").trim() === ""
                  ? "photo"
                  : "markdown"
              }
            >
              <TabsList className="h-auto p-1">
                <TabsTrigger value="markdown" className="gap-1.5 px-3 py-1.5">
                  <Pencil1Icon className="size-4" />
                  마크다운 작성
                </TabsTrigger>
                <TabsTrigger value="photo" className="gap-1.5 px-3 py-1.5">
                  <CameraIcon className="size-4" />
                  필기 사진
                  {noteImages.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {noteImages.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="markdown" className="mt-4">
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  placeholder="마크다운으로 노트를 작성하세요."
                  maxLength={50_000}
                />
              </TabsContent>

              <TabsContent value="photo" className="mt-4">
                <NoteImageUploader
                  images={noteImages}
                  onChange={setNoteImages}
                  disabled={isPending}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {category === "free" && (
        <Card>
          <CardHeader>
            <CardTitle>본문</CardTitle>
            <CardDescription>마크다운 문법을 사용할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="내용을 입력하세요. (마크다운 문법 사용 가능)"
              className="min-h-48"
              maxLength={50_000}
              required
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isPending || isUploading}>
          {isPending && <Spinner data-icon="inline-start" />}
          {mode === "create" ? "등록" : "저장"}
        </Button>
      </div>
    </form>
  )
}

export { PostForm }
