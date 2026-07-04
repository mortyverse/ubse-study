import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { BoardTabs } from "@/components/board/board-tabs"
import type { BoardListPost } from "@/components/board/types"
import type { BoardCategory } from "@/lib/types"

const CATEGORIES: BoardCategory[] = ["free", "material", "note"]

type RawPost = {
  id: string
  category: BoardCategory
  title: string
  week_number: number | null
  link_url: string | null
  file_path: string | null
  created_at: string
  users: { display_name: string; avatar_url: string | null } | null
  board_comments: { count: number }[] | null
}

function toListPost(row: RawPost): BoardListPost {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    week_number: row.week_number,
    link_url: row.link_url,
    file_path: row.file_path,
    created_at: row.created_at,
    users: row.users,
    comment_count: row.board_comments?.[0]?.count ?? 0,
  }
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const { tab } = await searchParams
  const initialTab: BoardCategory = CATEGORIES.includes(tab as BoardCategory)
    ? (tab as BoardCategory)
    : "free"

  const supabase = await createClient()
  const selectWithMeta =
    "*, users:author_id(display_name, avatar_url), board_comments(count)"

  const [{ data: freeRows }, { data: materialRows }, { data: noteRows }] =
    await Promise.all([
      supabase
        .from("board_posts")
        .select(selectWithMeta)
        .eq("category", "free")
        .order("created_at", { ascending: false }),
      supabase
        .from("board_posts")
        .select(selectWithMeta)
        .eq("category", "material")
        .order("created_at", { ascending: false }),
      supabase
        .from("board_posts")
        .select(selectWithMeta)
        .eq("category", "note")
        .order("created_at", { ascending: false }),
    ])

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-10 pt-28 pb-20 md:pt-32">
        <PageHeader
          eyebrow="BOARD"
          title="게시판"
          description="자유게시판·강의자료·필기노트를 한 곳에서 확인하세요."
        />

        <BoardTabs
          initialTab={initialTab}
          freePosts={((freeRows ?? []) as unknown as RawPost[]).map(toListPost)}
          materialPosts={((materialRows ?? []) as unknown as RawPost[]).map(
            toListPost,
          )}
          notePosts={((noteRows ?? []) as unknown as RawPost[]).map(toListPost)}
          isAdmin={profile.role === "admin"}
        />
      </Container>
    </main>
  )
}
