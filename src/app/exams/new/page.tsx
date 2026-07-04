import { redirect } from "next/navigation"

import { getSessionProfile } from "@/lib/auth"
import { Container } from "@/components/layout/container"
import { PageHeader } from "@/components/common/page-header"
import { ExamForm } from "@/components/exams/exam-form"

export default async function NewExamPage() {
  const { userId, profile } = await getSessionProfile()
  if (!userId) redirect("/auth/login")
  if (!profile || profile.status !== "approved") redirect("/pending")
  if (profile.role !== "admin") redirect("/exams")

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-10 pt-28 pb-20 md:pt-32">
        <PageHeader eyebrow="EXAM · ADMIN" title="시험 만들기" />
        <ExamForm />
      </Container>
    </main>
  )
}
