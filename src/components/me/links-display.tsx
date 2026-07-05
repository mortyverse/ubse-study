import Link from "next/link"
import { GitHubLogoIcon, Link2Icon } from "@radix-ui/react-icons"

import { Card, CardContent } from "@/components/ui/card"

/** 타인 프로필용 링크 읽기 전용 표시 (수정 폼 없음 — /members/[id]). */
function LinksDisplay({
  githubUrl,
  projectUrl,
}: {
  githubUrl: string | null
  projectUrl: string | null
}) {
  if (!githubUrl && !projectUrl) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          등록된 링크가 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {githubUrl && (
          <Link
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            <GitHubLogoIcon className="size-4 shrink-0 text-muted-foreground" />
            {githubUrl}
          </Link>
        )}
        {projectUrl && (
          <Link
            href={projectUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            <Link2Icon className="size-4 shrink-0 text-muted-foreground" />
            {projectUrl}
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

export { LinksDisplay }
