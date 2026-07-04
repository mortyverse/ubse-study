import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { PostForm } from "@/components/board/post-form"
import { CATEGORY_LABEL } from "@/components/board/types"
import type { BoardCategory } from "@/lib/types"

const CATEGORIES: BoardCategory[] = ["free", "material", "note"]

export default async function NewBoardPostPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const { category: rawCategory } = await searchParams
  const category = CATEGORIES.includes(rawCategory as BoardCategory)
    ? (rawCategory as BoardCategory)
    : null
  if (!category) redirect("/board")
  // 강의자료는 admin 전용 — 프론트 가드 (API/RLS에서도 재검증됨, 3계층 권한 규칙)
  if (category === "material" && profile.role !== "admin") redirect("/board")

  let weeklyPlans: { week_number: number; title: string }[] = []
  if (category === "material") {
    const supabase = await createClient()
    const { data } = await supabase
      .from("weekly_plans")
      .select("week_number, title")
      .order("week_number", { ascending: true })
    weeklyPlans = data ?? []
  }

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-10 pt-28 pb-20 md:pt-32">
        <PageHeader
          eyebrow={`BOARD · ${CATEGORY_LABEL[category]}`}
          title={
            category === "free"
              ? "글쓰기"
              : category === "material"
                ? "자료 올리기"
                : "노트 쓰기"
          }
        />
        <PostForm category={category} mode="create" weeklyPlans={weeklyPlans} />
      </Container>
    </main>
  )
}
