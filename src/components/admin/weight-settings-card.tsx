"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

/** 총점 가중치 설정 (PATCH /api/admin/settings, PRD §4.4). */
function WeightSettingsCard({ attendanceWeight }: { attendanceWeight: number }) {
  const router = useRouter()
  const [weight, setWeight] = React.useState(String(attendanceWeight))
  const [isPending, setIsPending] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendance_weight: Number(weight) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "설정 저장에 실패했습니다.")
        return
      }
      toast.success("가중치를 저장했습니다.")
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
        <CardTitle>총점 가중치 설정</CardTitle>
        <CardDescription>
          총점 = 시험 확정 점수 합 + 출석률(0–1) × 가중치
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field className="max-w-48">
            <FieldLabel htmlFor="attendance-weight">출석 가중치</FieldLabel>
            <Input
              id="attendance-weight"
              type="number"
              min={0}
              max={1000}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <FieldDescription>0–1000 사이의 값</FieldDescription>
          </Field>
          <Button type="submit" disabled={isPending}>
            저장
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export { WeightSettingsCard }
