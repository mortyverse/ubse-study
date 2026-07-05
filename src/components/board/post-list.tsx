import Link from "next/link"
import { CameraIcon, ChatBubbleIcon } from "@radix-ui/react-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  MaterialInlineActions,
  MaterialAdminMenu,
} from "@/components/board/material-actions"
import type { BoardListPost } from "@/components/board/types"
import type { BoardCategory } from "@/lib/types"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function PostMeta({ post }: { post: BoardListPost }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 text-sm text-muted-foreground">
      {post.users && (
        <span className="flex items-center gap-1.5">
          <Avatar size="sm">
            <AvatarImage
              src={post.users.avatar_url ?? undefined}
              alt={post.users.display_name}
            />
            <AvatarFallback>{post.users.display_name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline">{post.users.display_name}</span>
        </span>
      )}
      <span>{formatDate(post.created_at)}</span>
    </div>
  )
}

/**
 * 게시판 목록 행. 탭(카테고리)에 따라 부가 정보만 달라진다 —
 * 자유게시판/필기노트: 상세 페이지 링크 행. 강의자료: 상세 페이지 없이
 * 목록에서 바로 내려받기/링크 열기(admin은 수정·삭제까지) 하는 정적 행.
 * 흰색 표면 + 헤어라인 구분(#ECEAF1) + 라벤더 톤 hover — CLAUDE.md 테이블 규칙.
 */
function PostList({
  category,
  posts,
  isAdmin = false,
}: {
  category: BoardCategory
  posts: BoardListPost[]
  isAdmin?: boolean
}) {
  const rowClass = (i: number) =>
    `flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3.5 hover:bg-accent/40 ${
      i > 0 ? "border-t border-border" : ""
    }`

  if (category === "material") {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        {posts.map((post, i) => (
          <div key={post.id} className={rowClass(i)}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {post.week_number && (
                <Badge variant="outline" className="shrink-0">
                  {post.week_number}주차
                </Badge>
              )}
              <span className="truncate font-medium text-foreground">
                {post.title}
              </span>
              <MaterialInlineActions
                postId={post.id}
                hasFile={Boolean(post.file_path)}
                linkUrl={post.link_url}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <PostMeta post={post} />
              {isAdmin && <MaterialAdminMenu postId={post.id} />}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {posts.map((post, i) => (
        <Link key={post.id} href={`/board/${post.id}`} className={rowClass(i)}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="truncate font-medium text-foreground">
              {post.title}
            </span>
            {category === "note" && post.image_count > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                <CameraIcon />
                {post.image_count}
              </span>
            )}
            {category === "free" && post.comment_count > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                <ChatBubbleIcon />
                {post.comment_count}
              </span>
            )}
          </div>
          <PostMeta post={post} />
        </Link>
      ))}
    </div>
  )
}

export { PostList }
