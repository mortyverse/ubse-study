"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
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
import type { PlanLecture, WeeklyPlan } from "@/lib/types"

/**
 * 주차별 계획 표 + 진행 현황 (PRD §4.3).
 * - 강의 범위는 plan_lectures 기반의 강의 블록(1강, 2강, …)으로 표시한다.
 * - admin은 블록을 다른 주차 행으로 드래그앤드랍해 진도를 재배정할 수 있고
 *   (PATCH /api/plan-lectures/[n]), 행별 체크박스로 완료 여부를 토글한다.
 */
function WeeklyPlanPanel({
  initialPlans,
  initialLectures,
  isAdmin,
}: {
  initialPlans: WeeklyPlan[]
  initialLectures: PlanLecture[]
  isAdmin: boolean
}) {
  const [plans, setPlans] = React.useState(initialPlans)
  const [lectures, setLectures] = React.useState(initialLectures)
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set())
  const [draggingLecture, setDraggingLecture] = React.useState<number | null>(
    null,
  )
  const [dropWeek, setDropWeek] = React.useState<number | null>(null)

  const total = plans.length
  const completed = plans.filter((p) => p.is_completed).length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  const lecturesByWeek = React.useMemo(() => {
    const map = new Map<number, number[]>()
    for (const l of lectures) {
      const list = map.get(l.week_number) ?? []
      list.push(l.lecture_number)
      map.set(l.week_number, list)
    }
    for (const list of map.values()) list.sort((a, b) => a - b)
    return map
  }, [lectures])

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

  const moveLecture = async (lectureNumber: number, toWeek: number) => {
    const previous = lectures
    const current = lectures.find((l) => l.lecture_number === lectureNumber)
    if (!current || current.week_number === toWeek) return

    // 낙관적 이동 — 실패 시 되돌린다
    setLectures((prev) =>
      prev.map((l) =>
        l.lecture_number === lectureNumber ? { ...l, week_number: toWeek } : l,
      ),
    )
    try {
      const res = await fetch(`/api/plan-lectures/${lectureNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_number: toWeek }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLectures(previous)
        toast.error(data.error ?? "강의 이동에 실패했습니다.")
        return
      }
      toast.success(`${lectureNumber}강을 ${toWeek}주차로 옮겼습니다.`)
    } catch {
      setLectures(previous)
      toast.error("네트워크 오류가 발생했습니다.")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-medium text-foreground">
            진행 현황
          </span>
          <span className="text-base text-muted-foreground">
            {completed}/{total} 완료 ({percentage}%)
          </span>
        </div>
        <Progress value={percentage} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5 py-3 text-base">주차</TableHead>
              <TableHead className="px-3 py-3 text-center text-base">섹션</TableHead>
              <TableHead className="px-3 py-3 text-base">강의</TableHead>
              <TableHead className="px-3 py-3 text-base">제목</TableHead>
              <TableHead className="px-3 py-3 text-center text-base">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => {
              const weekLectures = lecturesByWeek.get(plan.week_number) ?? []
              const isDropTarget =
                draggingLecture !== null && dropWeek === plan.week_number
              return (
                <TableRow
                  key={plan.id}
                  className={cn(
                    "transition-colors hover:bg-accent/40",
                    isDropTarget && "bg-primary/8 outline-2 -outline-offset-2 outline-dashed outline-primary/40",
                  )}
                  onDragOver={
                    isAdmin
                      ? (e) => {
                          if (draggingLecture === null) return
                          e.preventDefault()
                          setDropWeek(plan.week_number)
                        }
                      : undefined
                  }
                  onDragLeave={
                    isAdmin
                      ? () =>
                          setDropWeek((w) =>
                            w === plan.week_number ? null : w,
                          )
                      : undefined
                  }
                  onDrop={
                    isAdmin
                      ? (e) => {
                          e.preventDefault()
                          const n = Number(e.dataTransfer.getData("text/plain"))
                          setDropWeek(null)
                          setDraggingLecture(null)
                          if (Number.isInteger(n) && n >= 1) {
                            void moveLecture(n, plan.week_number)
                          }
                        }
                      : undefined
                  }
                >
                  <TableCell className="px-5 py-2.5 text-base whitespace-nowrap text-muted-foreground">
                    {plan.week_number}주차
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-center">
                    <span className="inline-flex size-7 items-center justify-center rounded-full border border-border text-sm font-medium text-muted-foreground">
                      {plan.section_number}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {weekLectures.length === 0 ? (
                        <span className="text-base text-muted-foreground">—</span>
                      ) : (
                        weekLectures.map((n) => (
                          <span
                            key={n}
                            draggable={isAdmin}
                            onDragStart={
                              isAdmin
                                ? (e) => {
                                    e.dataTransfer.setData(
                                      "text/plain",
                                      String(n),
                                    )
                                    e.dataTransfer.effectAllowed = "move"
                                    setDraggingLecture(n)
                                  }
                                : undefined
                            }
                            onDragEnd={
                              isAdmin
                                ? () => {
                                    setDraggingLecture(null)
                                    setDropWeek(null)
                                  }
                                : undefined
                            }
                            className={cn(
                              "rounded-md bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground select-none",
                              isAdmin && "cursor-grab active:cursor-grabbing",
                              draggingLecture === n && "opacity-40",
                            )}
                          >
                            {n}강
                          </span>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-base font-medium text-foreground">
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
                  <TableCell className="px-3 py-2.5">
                    <div className="flex items-center justify-center">
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
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

    </div>
  )
}

export { WeeklyPlanPanel }
