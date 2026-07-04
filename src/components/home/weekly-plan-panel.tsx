"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { WeeklyPlan } from "@/lib/types"

/**
 * 주차별 계획 표 + 진행 현황 (PRD §4.3). member는 읽기 전용(완료/예정 칩),
 * admin은 행별 체크박스로 낙관적 갱신 + PATCH /api/weekly-plans/[id].
 */
function WeeklyPlanPanel({
  initialPlans,
  isAdmin,
}: {
  initialPlans: WeeklyPlan[]
  isAdmin: boolean
}) {
  const [plans, setPlans] = React.useState(initialPlans)
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set())

  const total = plans.length
  const completed = plans.filter((p) => p.is_completed).length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  const handleToggle = async (id: string, nextCompleted: boolean) => {
    const previous = plans
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_completed: nextCompleted } : p)),
    )
    setPendingIds((prev) => new Set(prev).add(id))

    try {
      const res = await fetch(`/api/weekly-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: nextCompleted }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPlans(previous)
        toast.error(data.error ?? "진행 상태 변경에 실패했습니다.")
        return
      }
    } catch {
      setPlans(previous)
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">진행 현황</span>
          <span className="text-sm text-muted-foreground">
            {completed}/{total} 완료 ({percentage}%)
          </span>
        </div>
        <Progress value={percentage} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>주차</TableHead>
              <TableHead>섹션</TableHead>
              <TableHead>강의 범위</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id} className="hover:bg-accent/40">
                <TableCell className="text-muted-foreground">
                  {plan.week_number}주차
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {plan.section_number}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {plan.lecture_range}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {plan.resource_url ? (
                    <Link
                      href={plan.resource_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {plan.title}
                    </Link>
                  ) : (
                    plan.title
                  )}
                </TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Checkbox
                      checked={plan.is_completed}
                      disabled={pendingIds.has(plan.id)}
                      aria-label={`${plan.week_number}주차 ${plan.section_number}섹션 완료 여부`}
                      onCheckedChange={(checked) =>
                        handleToggle(plan.id, checked === true)
                      }
                    />
                  ) : plan.is_completed ? (
                    <Badge className="bg-success/15 text-[color-mix(in_srgb,var(--success)_75%,var(--foreground))]">
                      완료
                    </Badge>
                  ) : (
                    <Badge variant="outline">예정</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export { WeeklyPlanPanel }
