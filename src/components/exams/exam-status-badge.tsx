import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { EXAM_STATUS_LABEL, type ExamViewStatus } from "@/components/exams/status"

// 카테고리 액센트 팔레트만 사용 (violet은 화면당 primary 버튼 1개 규칙을 지키기 위해
// 배지에는 쓰지 않는다 — CLAUDE.md 색상 규칙).
const examStatusBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      status: {
        not_started:
          "bg-slate-accent/15 text-[color-mix(in_srgb,var(--slate-accent)_75%,var(--foreground))]",
        in_progress:
          "bg-warning/15 text-[color-mix(in_srgb,var(--warning)_75%,var(--foreground))]",
        grading: "bg-muted text-muted-foreground",
        failed: "bg-destructive/10 text-destructive",
        completed:
          "bg-success/15 text-[color-mix(in_srgb,var(--success)_75%,var(--foreground))]",
      },
    },
    defaultVariants: {
      status: "not_started",
    },
  },
)

function ExamStatusBadge({
  status,
  className,
}: {
  status: ExamViewStatus
  className?: string
}) {
  return (
    <span
      data-slot="exam-status-badge"
      className={cn(examStatusBadgeVariants({ status }), className)}
    >
      {EXAM_STATUS_LABEL[status]}
    </span>
  )
}

export { ExamStatusBadge }
