"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { uploadViaSignedUrl } from "@/lib/storage-upload"
import { CameraIcon, Pencil1Icon } from "@radix-ui/react-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"

/**
 * 프로필 헤더 (아바타 + 이름 + 한 줄 소개).
 * editable(본인 마이페이지)이면 사진 업로드(POST /api/me/avatar)와
 * 이름/소개 인라인 수정(PATCH /api/me/profile)이 열린다.
 * 타인 프로필(/members/[id])에서는 읽기 전용으로만 렌더된다.
 */
function ProfileCard({
  name,
  bio,
  avatarUrl,
  editable = false,
}: {
  name: string
  bio: string | null
  avatarUrl: string | null
  editable?: boolean
}) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [draftName, setDraftName] = React.useState(name)
  const [draftBio, setDraftBio] = React.useState(bio ?? "")
  const [isPending, setIsPending] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setIsUploading(true)
    try {
      // 1) 토큰 발급 + Storage 직접 업로드, 2) avatar_url 확정 (PATCH)
      const result = await uploadViaSignedUrl("/api/me/avatar", file)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const res = await fetch("/api/me/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: result.file_path }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "사진 업로드에 실패했습니다.")
        return
      }
      toast.success("프로필 사진을 변경했습니다.")
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: draftName, bio: draftBio }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "프로필 저장에 실패했습니다.")
        return
      }
      toast.success("프로필을 저장했습니다.")
      setIsEditing(false)
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex items-start gap-5">
      <div className="relative shrink-0">
        <Avatar className="size-20">
          <AvatarImage src={avatarUrl ?? undefined} alt={name} />
          <AvatarFallback className="text-2xl">{name.charAt(0)}</AvatarFallback>
        </Avatar>
        {editable && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              aria-label="프로필 사진 변경"
              className="absolute -right-1 -bottom-1 z-10 flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-primary disabled:opacity-50"
            >
              <CameraIcon className="size-4" />
            </button>
          </>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="flex max-w-md flex-1 flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="profile-name">이름</FieldLabel>
            <Input
              id="profile-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={30}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-bio">한 줄 소개</FieldLabel>
            <Input
              id="profile-bio"
              value={draftBio}
              onChange={(e) => setDraftBio(e.target.value)}
              maxLength={100}
              placeholder="나를 한 줄로 소개해보세요"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} size="sm">
              저장
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setIsEditing(false)
                setDraftName(name)
                setDraftBio(bio ?? "")
              }}
            >
              취소
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1.5">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-heading text-2xl font-bold text-foreground">{name}</h2>
            {editable && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="프로필 수정"
                onClick={() => {
                  setDraftName(name)
                  setDraftBio(bio ?? "")
                  setIsEditing(true)
                }}
              >
                <Pencil1Icon />
              </Button>
            )}
          </div>
          {bio ? (
            <p className="text-muted-foreground">{bio}</p>
          ) : editable ? (
            <p className="text-muted-foreground/60">
              아직 한 줄 소개가 없습니다 — 연필 버튼으로 등록해보세요.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export { ProfileCard }
