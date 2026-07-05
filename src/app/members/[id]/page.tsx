import { notFound, redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { ProfileCard } from "@/components/me/profile-card"
import { ProfileSections } from "@/components/me/profile-sections"

/**
 * 스터디원 공개 프로필 (PRD §4.4 확장 — 랭킹 실명 공개와 같은 노출 범위).
 * 마이페이지와 같은 구성(통계/출석 이력/링크)을 읽기 전용으로 보여준다.
 * 본인 프로필로 들어오면 수정 가능한 마이페이지로 보낸다.
 */
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")
  if (id === profile.id) redirect("/me")

  // approved peers SELECT 정책(0001)으로 본인 세션에서 조회 — 승인되지 않은
  // 대상이나 존재하지 않는 id는 RLS에 걸러져 404가 된다.
  const supabase = await createClient()
  const { data: target } = await supabase
    .from("users")
    .select("id, display_name, avatar_url, bio, status")
    .eq("id", id)
    .maybeSingle()

  if (!target || target.status !== "approved") notFound()

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-12 pt-28 pb-20 md:pt-32">
        <PageHeader eyebrow="PROFILE" title={`${target.display_name}님의 프로필`} />

        <ProfileCard
          name={target.display_name}
          bio={target.bio ?? null}
          avatarUrl={target.avatar_url ?? null}
        />

        <ProfileSections
          targetId={target.id}
          targetName={target.display_name}
          isOwner={false}
        />
      </Container>
    </main>
  )
}
