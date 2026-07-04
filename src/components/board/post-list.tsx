import Link from "next/link"
import { ChatBubbleIcon, FileTextIcon, Link2Icon } from "@radix-ui/react-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import type { BoardListPost } from "@/components/board/types"
import type { BoardCategory } from "@/lib/types"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/**
 * 게시판 목록 행. 탭(카테고리)에 따라 부가 정보만 달라진다 —
 * 자유게시판: 작성자 + 댓글 수 / 강의자료: 주차 + 첨부·링크 표시 / 필기노트: 작성자.
 * 흰색 표면 + 헤어라인 구분(#ECEAF1) + 라벤더 톤 hover — CLAUDE.md 테이블 규칙.
 */
function PostList({
  category,
  posts,
}: {
  category: BoardCategory
  posts: BoardListPost[]
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {posts.map((post, i) => (
        <Link
          key={post.id}
          href={`/board/${post.id}`}
          className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3.5 hover:bg-accent/40 ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {category === "material" && post.week_number && (
              <Badge variant="outline" className="shrink-0">
                {post.week_number}주차
              </Badge>
            )}
            <span className="truncate font-medium text-foreground">
              {post.title}
            </span>
            {category === "material" && (
              <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                {post.file_path && <FileTextIcon aria-label="첨부 파일" />}
                {post.link_url && <Link2Icon aria-label="링크" />}
              </span>
            )}
            {category === "free" && post.comment_count > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <ChatBubbleIcon />
                {post.comment_count}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground">
            {post.users && (
              <span className="flex items-center gap-1.5">
                <Avatar size="sm">
                  <AvatarImage
                    src={post.users.avatar_url ?? undefined}
                    alt={post.users.display_name}
                  />
                  <AvatarFallback>
                    {post.users.display_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{post.users.display_name}</span>
              </span>
            )}
            <span>{formatDate(post.created_at)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

export { PostList }
