import type { BoardCategory } from "@/lib/types"

// 게시판 UI 전용 뷰 타입 — API embed 결과(작성자/댓글 수)에 맞춘 형태.
// DB 계약 자체는 src/lib/types.ts의 BoardPost/BoardComment를 따른다.

export type PostAuthor = {
  display_name: string
  avatar_url: string | null
}

export interface BoardListPost {
  id: string
  category: BoardCategory
  title: string
  week_number: number | null
  link_url: string | null
  file_path: string | null
  created_at: string
  users: PostAuthor | null
  comment_count: number
  /** 필기노트 공책 사진 장수 (다른 카테고리는 항상 0) */
  image_count: number
}

export interface BoardCommentView {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  users: PostAuthor | null
}

export const CATEGORY_LABEL: Record<BoardCategory, string> = {
  free: "자유게시판",
  material: "강의자료",
  note: "필기노트",
}
