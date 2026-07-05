import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { buildRanking } from "@/lib/ranking"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { ProfileCard } from "@/components/me/profile-card"
import { ProfileSections } from "@/components/me/profile-sections"
import { RankingTable } from "@/components/me/ranking-table"

export default async function MyPage() {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const supabase = await createClient()

  // AppUser 타입 계약(src/lib/types.ts)에는 bio가 없어(0015에서 추가된 컬럼 —
  // 타입 계약 파일은 건드리지 않는다) 별도 조회한다 (github_url과 동일한 방식).
  const [ranking, meRes] = await Promise.all([
    buildRanking(),
    supabase.from("users").select("display_name, avatar_url, bio").eq("id", profile.id).single(),
  ])

  const displayName = meRes.data?.display_name ?? profile.display_name

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-12 pt-28 pb-20 md:pt-32">
        <PageHeader eyebrow="MY PAGE" title="마이페이지" />

        <ProfileCard
          name={displayName}
          bio={meRes.data?.bio ?? null}
          avatarUrl={meRes.data?.avatar_url ?? null}
          editable
        />

        <ProfileSections targetId={profile.id} targetName={displayName} isOwner />

        <section className="flex flex-col gap-4">
          <h2 className="text-xl">전체 랭킹</h2>
          <RankingTable entries={ranking.entries} viewerId={profile.id} />
          <p className="text-sm text-muted-foreground">
            총점 = 시험 확정 점수 합 + 출석률 × 가중치(현재 {ranking.settings.attendance_weight})
          </p>
        </section>
      </Container>
    </main>
  )
}
