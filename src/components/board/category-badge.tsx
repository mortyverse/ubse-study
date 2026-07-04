import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { CATEGORY_LABEL } from "@/components/board/types"
import type { BoardCategory } from "@/lib/types"

// violet/pink은 "화면당 primary 버튼 1개" · "장식 전용" 규칙 때문에 배지에는 쓰지
// 않는다 (exam-status-badge.tsx / status-badge.tsx와 동일한 컨벤션) — 나머지
// 카테고리 액센트(terracotta/slate/amber)만 사용.
const categoryBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      category: {
        free: "bg-slate-accent/15 text-[color-mix(in_srgb,var(--slate-accent)_75%,var(--foreground))]",
        material:
          "bg-terracotta/15 text-[color-mix(in_srgb,var(--terracotta)_75%,var(--foreground))]",
        note: "bg-warning/15 text-[color-mix(in_srgb,var(--warning)_75%,var(--foreground))]",
      },
    },
    defaultVariants: {
      category: "free",
    },
  },
)

function CategoryBadge({
  category,
  className,
}: {
  category: BoardCategory
  className?: string
}) {
  return (
    <span
      data-slot="category-badge"
      className={cn(categoryBadgeVariants({ category }), className)}
    >
      {CATEGORY_LABEL[category]}
    </span>
  )
}

export { CategoryBadge }
