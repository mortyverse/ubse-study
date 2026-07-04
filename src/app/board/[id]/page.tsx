import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLinkIcon } from "@radix-ui/react-icons"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Container } from "@/components/layout/container"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { CategoryBadge } from "@/components/board/category-badge"
import { MarkdownContent } from "@/components/board/markdown-content"
import { PostActions } from "@/components/board/post-actions"
import { PostComments } from "@/components/board/post-comments"
import { AttachmentDownloadButton } from "@/components/board/attachment-download-button"
import type { BoardCommentView } from "@/components/board/types"
import type { AppUser, BoardPost } from "@/lib/types"

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type RawPost = BoardPost & {
  users: Pick<AppUser, "display_name" | "avatar_url"> | null
}

/** 수정/삭제 권한 (board_posts/[id] API와 동일한 규칙) */
function canModify(post: RawPost, profile: AppUser) {
  if (post.category === "material") return profile.role === "admin"
  return post.author_id === profile.id
}

export default async function BoardPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const { id } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from("board_posts")
    .select("*, users:author_id(display_name, avatar_url)")
    .eq("id", id)
    .maybeSingle()

  if (!post) notFound()
  const typedPost = post as unknown as RawPost

  const { data: comments } = await supabase
    .from("board_comments")
    .select("id, post_id, author_id, content, created_at, users:author_id(display_name, avatar_url)")
    .eq("post_id", id)
    .order("created_at", { ascending: true })

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-10 pt-28 pb-20 md:pt-32">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CategoryBadge category={typedPost.category} />
                {typedPost.category === "material" && typedPost.week_number && (
                  <span className="text-xs text-muted-foreground">
                    {typedPost.week_number}주차
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl">{typedPost.title}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Avatar size="sm">
                  <AvatarImage
                    src={typedPost.users?.avatar_url ?? undefined}
                    alt={typedPost.users?.display_name ?? "알 수 없음"}
                  />
                  <AvatarFallback>
                    {(typedPost.users?.display_name ?? "?").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">
                  {typedPost.users?.display_name ?? "알 수 없음"}
                </span>
                <span>{formatDateTime(typedPost.created_at)}</span>
              </div>
            </div>
            {canModify(typedPost, profile) && (
              <PostActions postId={typedPost.id} category={typedPost.category} />
            )}
          </div>

          {typedPost.link_url && (
            <Link
              href={typedPost.link_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-border bg-band-lavender/40 px-4 py-3 text-sm text-foreground hover:bg-band-lavender/60"
            >
              <ExternalLinkIcon className="shrink-0 text-muted-foreground" />
              <span className="truncate underline underline-offset-4">{typedPost.link_url}</span>
            </Link>
          )}

          {typedPost.file_path && <AttachmentDownloadButton postId={typedPost.id} />}

          {typedPost.content_markdown && (
            <Card>
              <CardContent>
                <MarkdownContent content={typedPost.content_markdown} />
              </CardContent>
            </Card>
          )}
        </div>

        <PostComments
          postId={typedPost.id}
          initialComments={(comments ?? []) as unknown as BoardCommentView[]}
          viewerId={profile.id}
        />
      </Container>
    </main>
  )
}
