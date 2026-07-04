"use client"

import * as React from "react"
import { toast } from "sonner"
import { ArrowDownIcon, Cross2Icon, PlusIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Gravity, MatterBody } from "@/components/ui/gravity"
import type { HeroChip, HeroChipColor } from "@/lib/types"

/** 색상 키 → 디자인 토큰 클래스 (7종 고정 — DB CHECK와 일치해야 한다) */
const CHIP_COLOR_CLASS: Record<HeroChipColor, string> = {
  violet: "bg-primary text-primary-foreground",
  slate: "bg-chart-4 text-white",
  sage: "bg-chart-5 text-white",
  terracotta: "bg-chart-3 text-white",
  amber: "bg-chart-6 text-white",
  peach: "bg-band-peach text-foreground",
  pink: "bg-band-pink text-foreground",
}
const COLOR_KEYS = Object.keys(CHIP_COLOR_CLASS) as HeroChipColor[]

/**
 * 칩 id 해시 기반 결정적 낙하 시작 위치.
 * 배열 index를 쓰면 삭제 시 뒤 칩들의 props가 바뀌어 물리 바디가 재등록(위치
 * 리셋)되므로, 순서와 무관한 id에서 위치를 유도한다.
 */
function dropPosition(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return {
    x: `${18 + (h % 65)}%`,
    y: `${5 + ((h >> 3) % 18)}%`,
    angle: (((h >> 5) % 21) - 10),
  }
}

/** 클로드 로고(선버스트 스파크) — 브랜드 테라코타, 외부 에셋 없이 인라인 SVG */
function ClaudeSpark({ className }: { className?: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 + 8) * (Math.PI / 180)
    const length = i % 2 === 0 ? 15 : 12.5
    return {
      x1: 16 + Math.cos(angle) * 4,
      y1: 16 + Math.sin(angle) * 4,
      x2: 16 + Math.cos(angle) * length,
      y2: 16 + Math.sin(angle) * length,
    }
  })
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      {rays.map((r, i) => (
        <line
          key={i}
          x1={r.x1}
          y1={r.y1}
          x2={r.x2}
          y2={r.y2}
          stroke="#D97757"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/**
 * 개별 중력 칩. memo 필수 — 부모가 리렌더돼도 props가 같으면 MatterBody의
 * 등록 effect가 다시 돌지 않아 물리 월드가 리셋되지 않는다.
 */
const GravityChip = React.memo(function GravityChip({
  chip,
  isAdmin,
  onDelete,
}: {
  chip: HeroChip
  isAdmin: boolean
  onDelete: (id: string) => void
}) {
  const pos = dropPosition(chip.id)
  return (
    <MatterBody
      matterBodyOptions={{ friction: 0.5, restitution: 0.2 }}
      x={pos.x}
      y={pos.y}
      angle={pos.angle}
    >
      <div
        className={cn(
          "relative rounded-full px-6 py-3 text-lg hover:cursor-grab sm:px-8 sm:py-4 sm:text-2xl md:text-3xl",
          CHIP_COLOR_CLASS[chip.color]
        )}
      >
        {chip.label}
        {isAdmin && (
          <button
            type="button"
            aria-label={`${chip.label} 블록 삭제`}
            onClick={() => onDelete(chip.id)}
            className="pointer-events-auto absolute -top-1 -right-1 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-destructive hover:text-white"
          >
            <Cross2Icon className="size-3.5" />
          </button>
        )}
      </div>
    </MatterBody>
  )
})

/** 블록 추가 다이얼로그 — 입력 상태를 여기 가둬서 히어로(물리 월드) 리렌더를 막는다 */
function AddChipDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (chip: HeroChip) => void
}) {
  const [label, setLabel] = React.useState("")
  const [color, setColor] = React.useState<HeroChipColor>("violet")
  const [pending, setPending] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    setPending(true)
    try {
      const res = await fetch("/api/hero-chips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "블록 추가에 실패했습니다.")
        return
      }
      onAdded(data.chip)
      toast.success("블록을 추가했습니다.")
      setLabel("")
      onOpenChange(false)
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-96">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>블록 추가</DialogTitle>
            <DialogDescription>
              문구와 색상을 고르면 화면 위에서 떨어집니다.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="chip-label">문구</FieldLabel>
            <Input
              id="chip-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 코드 리뷰"
              maxLength={20}
              required
            />
          </Field>

          <Field>
            <FieldLabel>색상</FieldLabel>
            <div className="flex flex-wrap gap-2.5">
              {COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`색상 ${key}`}
                  aria-pressed={color === key}
                  onClick={() => setColor(key)}
                  className={cn(
                    "size-8 rounded-full transition-transform",
                    CHIP_COLOR_CLASS[key].split(" ")[0],
                    color === key
                      ? "scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background"
                      : "hover:scale-105"
                  )}
                />
              ))}
            </div>
          </Field>

          <DialogFooter>
            <Button type="submit" disabled={pending || label.trim() === ""}>
              {pending && <Spinner data-icon="inline-start" />}
              추가
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GravityHero({
  initialChips,
  isAdmin,
}: {
  initialChips: HeroChip[]
  isAdmin: boolean
}) {
  const [chips, setChips] = React.useState(initialChips)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const handleAdded = React.useCallback((chip: HeroChip) => {
    setChips((prev) => [...prev, chip])
  }, [])

  const handleDelete = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/hero-chips/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "블록 삭제에 실패했습니다.")
        return
      }
      setChips((prev) => prev.filter((c) => c.id !== id))
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    }
  }, [])

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="pointer-events-none z-10 flex flex-col items-center gap-4 pt-28 text-center md:pt-36">
        <p className="text-xs font-semibold tracking-[0.2em] text-foreground">
          UbSE Lab-Study group
        </p>
        <h1 className="flex items-center justify-center gap-4 font-heading text-5xl font-extrabold tracking-[-0.04em] text-foreground sm:text-6xl md:text-7xl">
          <ClaudeSpark className="size-[0.85em] shrink-0" />
          Claude Code for developer
        </h1>
      </div>

      <Gravity gravity={{ x: 0, y: 1 }} className="h-full w-full">
        {chips.map((chip) => (
          <GravityChip
            key={chip.id}
            chip={chip}
            isAdmin={isAdmin}
            onDelete={handleDelete}
          />
        ))}
      </Gravity>

      <Button
        variant="outline"
        size="icon"
        aria-label="블록 추가"
        onClick={() => setDialogOpen(true)}
        className="absolute right-8 bottom-8 z-10 rounded-full shadow-sm"
      >
        <PlusIcon className="size-5" />
      </Button>
      <AddChipDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdded={handleAdded}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-1.5 text-foreground">
        <span className="text-[11px] font-semibold tracking-[0.25em]">SCROLL</span>
        <ArrowDownIcon className="size-4 animate-bounce" />
      </div>
    </div>
  )
}

export { GravityHero }
