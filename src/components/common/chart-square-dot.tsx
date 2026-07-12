"use client"

type SquareDotProps = {
  cx?: number
  cy?: number
  index?: number
}

/** 전체 평균 라인 전용 사각 마커 — recharts Line의 dot/activeDot에 함수형으로 전달 */
function renderAverageSquareDot(size: number) {
  return function AverageSquareDot(props: SquareDotProps) {
    const { cx, cy, index } = props
    if (cx == null || cy == null) return <g key={`avg-dot-${index}`} />
    return (
      <rect
        key={`avg-dot-${index}`}
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        rx={1}
        fill="var(--chart-average)"
      />
    )
  }
}

export { renderAverageSquareDot }
