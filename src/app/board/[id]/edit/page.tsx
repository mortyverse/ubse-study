import { notFound, redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { PostForm } from "@/components/board/post-form"
import { CATEGORY_LABEL } from "@/components/board/types"
import type { AppUser, BoardPost } from "@/lib/types"

function canModify(post: BoardPost, profile: AppUser) {
  if (post.category === "material") return profile.role === "admin"
  return post.author_id === profile.id
}

function fileNameFromPath(filePath: string | null) {
  if (!filePath) return null
  const parts = filePath.split("/")
  return parts[parts.length - 1] ?? filePath
}

export default async function EditBoardPostPage({
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
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (!post) notFound()
  const typedPost = post as BoardPost
  if (!canModify(typedPost, profile)) redirect("/board")

  // 필기노트 사진: private 버킷이라 폼 미리보기용 signed URL을 서버에서 발급
  let noteImages: { path: string; url: string }[] = []
  if (typedPost.category === "note" && (typedPost.image_paths?.length ?? 0) > 0) {
    const admin = createAdminClient()
    const { data: signed } = await admin.storage
      .from("notes")
      .createSignedUrls(typedPost.image_paths, 60 * 60)
    noteImages = (signed ?? []).flatMap((s, i) =>
      s.signedUrl
        ? [{ path: typedPost.image_paths[i], url: s.signedUrl }]
        : [],
    )
  }

  let weeklyPlans: { week_number: number; title: string }[] = []
  if (typedPost.category === "material") {
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
          eyebrow={`BOARD · ${CATEGORY_LABEL[typedPost.category]}`}
          title="게시글 수정"
        />
        <PostForm
          category={typedPost.category}
          mode="edit"
          postId={typedPost.id}
          weeklyPlans={weeklyPlans}
          initial={{
            title: typedPost.title,
            content_markdown: typedPost.content_markdown,
            link_url: typedPost.link_url,
            week_number: typedPost.week_number,
            file_path: typedPost.file_path,
            file_name: typedPost.file_name ?? fileNameFromPath(typedPost.file_path),
            images: noteImages,
          }}
        />
      </Container>
    </main>
  )
}
