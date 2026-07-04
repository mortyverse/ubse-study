"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { GitHubLogoIcon, Link2Icon } from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

/** GitHub/프로젝트 링크 표시 + 수정 (PATCH /api/me/links, PRD §4.4). */
function LinksForm({
  githubUrl,
  projectUrl,
}: {
  githubUrl: string | null
  projectUrl: string | null
}) {
  const router = useRouter()
  const [github, setGithub] = React.useState(githubUrl ?? "")
  const [project, setProject] = React.useState(projectUrl ?? "")
  const [isPending, setIsPending] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      const res = await fetch("/api/me/links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: github, project_url: project }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "링크 저장에 실패했습니다.")
        return
      }
      toast.success("링크를 저장했습니다.")
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>링크</CardTitle>
        <CardDescription>GitHub과 프로젝트 링크는 랭킹에도 함께 공개됩니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field className="flex-1">
            <FieldLabel htmlFor="github-url">
              <GitHubLogoIcon /> GitHub
            </FieldLabel>
            <Input
              id="github-url"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="https://github.com/username"
            />
          </Field>
          <Field className="flex-1">
            <FieldLabel htmlFor="project-url">
              <Link2Icon /> 프로젝트
            </FieldLabel>
            <Input
              id="project-url"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Button type="submit" disabled={isPending} className="sm:w-28">
            저장
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export { LinksForm }
