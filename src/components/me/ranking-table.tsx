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
            <TableHead className="w-14">순위</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>시험 총점</TableHead>
            <TableHead>출석률</TableHead>
            <TableHead>총점</TableHead>
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
              <TableCell className="font-heading font-bold text-foreground">
                {entry.rank}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarImage src={entry.avatar_url ?? undefined} alt={entry.display_name} />
                    <AvatarFallback>{entry.display_name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">{entry.display_name}</span>
                  {(entry.github_url || entry.project_url) && (
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
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
              <TableCell className="text-muted-foreground">
                {formatScore(entry.exam_total)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatPercent(entry.attendance_rate)}
              </TableCell>
              <TableCell className="font-medium text-foreground">
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
