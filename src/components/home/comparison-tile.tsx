import { cn } from "@/lib/utils"

/**
 * 본인 vs 전체 평균 비교 타일 (PRD §4.7 세 번째 통계 블록).
 * 큰 숫자 + 뮤트 라벨의 차분한 스탯 카드이며, 화려한 게이지 대신
 * 얇은 2단 바(본인=violet, 평균=slate)로 상대 크기만 조용히 보여준다.
 */
function ComparisonTile({
  label,
  mineValue,
  averageValue,
  formatValue,
  barMax,
  className,
}: {
  label: string
  mineValue: number
  averageValue: number
  formatValue: (n: number) => string
  /** 바 스케일 기준값 — 생략 시 mine/average 중 큰 값 사용 */
  barMax?: number
  className?: string
}) {
  const max = barMax ?? Math.max(mineValue, averageValue, 1)
  const minePct = Math.min(100, (mineValue / max) * 100)
  const avgPct = Math.min(100, (averageValue / max) * 100)

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-6",
        className
      )}
    >
      <span className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
        {label}
      </span>

      <div className="flex items-end gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-heading text-3xl font-bold text-primary">
            {formatValue(mineValue)}
          </span>
          <span className="text-xs text-muted-foreground">내 값</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-heading text-xl font-bold text-slate-accent">
            {formatValue(averageValue)}
          </span>
          <span className="text-xs text-muted-foreground">전체 평균</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${minePct}%` }}
          />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-slate-accent transition-all"
            style={{ width: `${avgPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export { ComparisonTile }
