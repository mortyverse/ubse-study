import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      status: {
        present:
          "bg-status-present/15 text-[color-mix(in_srgb,var(--status-present)_75%,var(--foreground))]",
        late: "bg-status-late/15 text-[color-mix(in_srgb,var(--status-late)_75%,var(--foreground))]",
        absent:
          "bg-status-absent/15 text-[color-mix(in_srgb,var(--status-absent)_75%,var(--foreground))]",
      },
    },
    defaultVariants: {
      status: "absent",
    },
  }
)

const STATUS_LABEL = {
  present: "출석",
  late: "지각",
  absent: "결석",
} as const

type AttendanceStatus = keyof typeof STATUS_LABEL

function StatusBadge({
  status,
  className,
}: {
  status: AttendanceStatus
  className?: string
}) {
  return (
    <span
      data-slot="status-badge"
      className={cn(statusBadgeVariants({ status }), className)}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export { StatusBadge, type AttendanceStatus }
