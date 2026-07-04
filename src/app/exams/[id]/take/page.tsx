import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { Container } from "@/components/layout/container"
import { TakeExamView } from "@/components/exams/take-exam-view"

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")

  const { id: examId } = await params

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-8 pt-28 pb-20 md:pt-32">
        <TakeExamView examId={examId} />
      </Container>
    </main>
  )
}
