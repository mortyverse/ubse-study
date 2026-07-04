"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type WeeklyChartPoint = {
  label: string
  mine: number | null
  average: number | null
}

// 본인 데이터 = violet(--chart-1), 전체 평균 = slate(--chart-4) — CLAUDE.md 차트 규칙.
const chartConfig = {
  mine: { label: "내 점수", color: "var(--chart-1)" },
  average: { label: "전체 평균", color: "var(--chart-4)" },
} satisfies ChartConfig

/** 주차별 평균 점수 추이 (PRD §4.7) — 확정 점수만 반영, null은 데이터 없는 주차 */
function ScoreTrendChart({ data }: { data: WeeklyChartPoint[] }) {
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
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="average"
          stroke="var(--color-average)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 3 }}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

const percentChartConfig = {
  mine: { label: "내 출석률", color: "var(--chart-1)" },
  average: { label: "전체 평균", color: "var(--chart-4)" },
} satisfies ChartConfig

/** 주차별 출석률 추이 (PRD §4.7) — 종료된 세션만, 0–1 값을 %로 표시 */
function AttendanceTrendChart({ data }: { data: WeeklyChartPoint[] }) {
  return (
    <ChartContainer
      config={percentChartConfig}
      className="aspect-auto h-64 w-full"
    >
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
          width={40}
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                `${Math.round(Number(value) * 100)}%`,
                name === "mine" ? "내 출석률" : "전체 평균",
              ]}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="mine"
          stroke="var(--color-mine)"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="average"
          stroke="var(--color-average)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 3 }}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

export { ScoreTrendChart, AttendanceTrendChart }
