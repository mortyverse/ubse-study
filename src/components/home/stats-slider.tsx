"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/common/empty-state"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type GroupChartRow = {
  label: string
  average: number | null
  [memberId: string]: string | number | null
}

type Member = { id: string; name: string }

/** 본인 = violet 실선(강조), 전체 평균 = slate 점선, 나머지 멤버는 보조 팔레트 순환 */
const OTHER_COLORS = [
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-2)",
]

function buildConfig(members: Member[], viewerId: string): ChartConfig {
  const config: ChartConfig = {
    average: { label: "전체 평균", color: "var(--chart-4)" },
  }
  let otherIndex = 0
  for (const m of members) {
    config[m.id] =
      m.id === viewerId
        ? { label: `${m.name} (나)`, color: "var(--chart-1)" }
        : {
            label: m.name,
            color: OTHER_COLORS[otherIndex++ % OTHER_COLORS.length],
          }
  }
  return config
}

function TrendChart({
  data,
  members,
  viewerId,
  percent = false,
}: {
  data: GroupChartRow[]
  members: Member[]
  viewerId: string
  percent?: boolean
}) {
  const config = React.useMemo(
    () => buildConfig(members, viewerId),
    [members, viewerId]
  )
  const others = members.filter((m) => m.id !== viewerId)

  return (
    <ChartContainer config={config} className="aspect-auto h-[22rem] w-full">
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
          width={percent ? 40 : 32}
          domain={percent ? [0, 1] : undefined}
          tickFormatter={
            percent ? (v: number) => `${Math.round(v * 100)}%` : undefined
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={
                percent
                  ? (value, name) => [
                      `${Math.round(Number(value) * 100)}% `,
                      config[name as string]?.label ?? name,
                    ]
                  : undefined
              }
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />

        {/* 다른 멤버들 — 얇은 선, 순차 드로잉으로 인터랙티브한 느낌 */}
        {others.map((m, i) => (
          <Line
            key={m.id}
            type="monotone"
            dataKey={m.id}
            stroke={`var(--color-${m.id})`}
            strokeWidth={1.5}
            strokeOpacity={0.65}
            dot={{ r: 2.5 }}
            connectNulls={false}
            animationBegin={200 + i * 150}
            animationDuration={700}
          />
        ))}

        <Line
          type="monotone"
          dataKey="average"
          stroke="var(--color-average)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 3 }}
          connectNulls={false}
          animationBegin={0}
          animationDuration={700}
        />

        {/* 내 선 — 가장 굵게, 가장 마지막에 그려져 위에 얹힌다 */}
        <Line
          type="monotone"
          dataKey={viewerId}
          stroke={`var(--color-${viewerId})`}
          strokeWidth={2.5}
          dot={{ r: 3.5 }}
          connectNulls={false}
          animationBegin={300 + others.length * 150}
          animationDuration={800}
        />
      </LineChart>
    </ChartContainer>
  )
}

const SLIDES = [
  { key: "score", title: "점수 추이" },
  { key: "attendance", title: "출석률 추이" },
] as const

/**
 * 통계 슬라이더 — 그래프 하나만 보여주고 화살표/점으로 전환한다.
 * 섹션이 뷰포트에 들어올 때(스크롤 도착) 카드가 떠오르고, 차트가 remount되며
 * 선이 순차적으로 그려진다. 슬라이드를 넘길 때도 같은 드로잉이 재생된다.
 */
function StatsSlider({
  viewerId,
  members,
  scoreData,
  attendanceData,
}: {
  viewerId: string
  members: Member[]
  scoreData: GroupChartRow[]
  attendanceData: GroupChartRow[]
}) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [index, setIndex] = React.useState(0)
  const [inView, setInView] = React.useState(false)
  const [animKey, setAnimKey] = React.useState(0)

  // 스크롤로 섹션에 도착할 때마다 등장 애니메이션 + 차트 드로잉을 다시 재생
  React.useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          setAnimKey((k) => k + 1)
        } else {
          setInView(false)
        }
      },
      { threshold: 0.35 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const go = (next: number) => {
    setIndex(Math.min(SLIDES.length - 1, Math.max(0, next)))
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative transition-all duration-700 ease-out",
        inView ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
      )}
    >
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((slide, slideIndex) => {
            const data = slide.key === "score" ? scoreData : attendanceData
            return (
              <div
                key={slide.key}
                className="flex w-full shrink-0 flex-col gap-8 px-14"
                aria-hidden={index !== slideIndex}
              >
                <h2 className="text-center text-3xl">{slide.title}</h2>
                {data.length === 0 ? (
                  <EmptyState
                    title={
                      slide.key === "score"
                        ? "아직 확정된 점수가 없습니다"
                        : "아직 종료된 출석 세션이 없습니다"
                    }
                    description={
                      slide.key === "score"
                        ? "관리자가 시험 채점을 확정하면 이곳에 추이가 표시됩니다."
                        : "출석 세션이 종료되면 이곳에 추이가 표시됩니다."
                    }
                    className="py-16"
                  />
                ) : (
                  <TrendChart
                    key={`${slide.key}-${animKey}-${index}`}
                    data={data}
                    members={members}
                    viewerId={viewerId}
                    percent={slide.key === "attendance"}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 좌우 화살표 */}
      <Button
        variant="outline"
        size="icon"
        aria-label="이전 그래프"
        onClick={() => go(index - 1)}
        disabled={index === 0}
        className="absolute top-1/2 left-0 -translate-y-1/2 rounded-full"
      >
        <ChevronLeftIcon className="size-5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="다음 그래프"
        onClick={() => go(index + 1)}
        disabled={index === SLIDES.length - 1}
        className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full"
      >
        <ChevronRightIcon className="size-5" />
      </Button>

      {/* 하단 점 인디케이터 */}
      <div className="mt-8 flex justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            aria-label={`${slide.title} 보기`}
            aria-current={index === i}
            onClick={() => go(i)}
            className={cn(
              "size-2.5 rounded-full transition-all",
              index === i
                ? "w-6 bg-primary"
                : "bg-border hover:bg-muted-foreground/40"
            )}
          />
        ))}
      </div>
    </div>
  )
}

export { StatsSlider }
