"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { renderAverageSquareDot } from "@/components/common/chart-square-dot"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type ScoreTrendPoint = {
  label: string
  mine: number
  average: number
}

// 본인 데이터 = violet(--chart-1), 전체 평균 = pastel rose 실선 + 사각 마커(--chart-average).
const chartConfig = {
  mine: { label: "내 점수", color: "var(--chart-1)" },
  average: { label: "전체 평균", color: "var(--chart-average)" },
} satisfies ChartConfig

function ScoreChart({ data }: { data: ScoreTrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={12} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="mine"
          stroke="var(--color-mine)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="average"
          stroke="var(--color-average)"
          strokeWidth={2}
          strokeOpacity={0.75}
          dot={renderAverageSquareDot(6)}
          activeDot={renderAverageSquareDot(8)}
        />
      </LineChart>
    </ChartContainer>
  )
}

export { ScoreChart }
