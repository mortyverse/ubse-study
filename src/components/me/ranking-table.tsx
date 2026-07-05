import Link from "next/link"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { RankingEntry } from "@/lib/types"

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`
}

function formatScore(score: number) {
  return Math.round(score * 10) / 10
}

/** 전체 실명 랭킹 (PRD §4.4 — 익명화 없음). 본인 행은 은은한 라벤더로 강조. */
function RankingTable({
  entries,
  viewerId,
}: {
  entries: RankingEntry[]
  viewerId: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-16 text-center">순위</TableHead>
            <TableHead>이름</TableHead>
            <TableHead className="text-center">시험 총점</TableHead>
            <TableHead className="text-center">출석률</TableHead>
            <TableHead className="text-center">총점</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow
              key={entry.user_id}
              className={cn(
                "hover:bg-accent/40",
                entry.user_id === viewerId && "bg-band-lavender/60 hover:bg-band-lavender/70",
              )}
            >
              <TableCell className="text-center font-heading font-bold text-foreground">
                {entry.rank}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Link
                    href={entry.user_id === viewerId ? "/me" : `/members/${entry.user_id}`}
                    className="flex items-center gap-3 font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    <Avatar size="sm">
                      <AvatarImage src={entry.avatar_url ?? undefined} alt={entry.display_name} />
                      <AvatarFallback>{entry.display_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {entry.display_name}
                  </Link>
                  {(entry.github_url || entry.project_url) && (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {entry.github_url && (
                        <Link
                          href={entry.github_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-primary"
                        >
                          GitHub
                        </Link>
                      )}
                      {entry.project_url && (
                        <Link
                          href={entry.project_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-primary"
                        >
                          프로젝트
                        </Link>
                      )}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {formatScore(entry.exam_total)}
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {formatPercent(entry.attendance_rate)}
              </TableCell>
              <TableCell className="text-center font-medium text-foreground">
                {formatScore(entry.total_score)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export { RankingTable }
