"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-base font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(41,39,58,.06)] transition-[background-color,box-shadow,transform] duration-[50ms] hover:bg-primary-hover hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(115,101,166,.28)] motion-reduce:hover:scale-100",
        outline:
          "bg-background text-foreground shadow-[inset_0_0_0_1.5px_var(--border)] hover:bg-secondary aria-expanded:bg-secondary dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * primary(default) variant 한정: 포인터가 닿은 지점에서 deep violet 원이
 * 차오르는 radial-fill 호버. 원점/지름은 CSS 변수로만 전달하고 채움 원은
 * negative z-index라 children을 감싸지 않아도 텍스트/아이콘 위로 올라오지
 * 않는다 (버튼에 isolate로 자체 stacking context를 만들어 가둔다).
 * asChild(Link 등)는 span을 주입할 수 없어 기존 정적 호버로 폴백한다.
 */
function setFillOrigin(event: React.PointerEvent<HTMLElement>) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const d = Math.ceil(
    2 *
      Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y)
      )
  )
  el.style.setProperty("--fill-x", `${x}px`)
  el.style.setProperty("--fill-y", `${y}px`)
  el.style.setProperty("--fill-d", `${d}px`)
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  onPointerEnter,
  onPointerDown,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  // asChild(Link 등)여도 자식 엘리먼트 안에 fill span을 주입해 같은 효과를 낸다.
  // 자식이 엘리먼트가 아닌 극단적 케이스만 정적 스타일로 폴백.
  const withFill =
    variant === "default" &&
    (!asChild || React.isValidElement<{ children?: React.ReactNode }>(children))

  const fillSpan = (
    <span
      aria-hidden
      className="pointer-events-none absolute top-[var(--fill-y,50%)] left-[var(--fill-x,50%)] -z-10 size-[var(--fill-d,0px)] -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-primary transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/button:scale-100 group-active/button:scale-100 motion-reduce:transition-none"
    />
  )

  let content = children
  if (withFill) {
    if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
      // Slot이 className/핸들러를 자식(Link)에 병합하므로, span만 자식 내부로 넣는다
      content = React.cloneElement(
        children,
        undefined,
        <>
          {fillSpan}
          {children.props.children}
        </>
      )
    } else {
      content = (
        <>
          {fillSpan}
          {children}
        </>
      )
    }
  }

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        buttonVariants({ variant, size }),
        // 원본 OriginButton 방식의 반전형: 평상시 흰 표면 + violet 텍스트,
        // 호버 시 포인터 원점에서 violet이 차오르며 텍스트가 흰색으로 전환된다.
        withFill &&
          "relative isolate overflow-hidden border-border bg-background text-primary shadow-[0_1px_2px_rgba(41,39,58,.06)] transition-[color,box-shadow,transform] duration-300 hover:bg-background hover:text-primary-foreground",
        className
      )}
      onPointerEnter={
        withFill
          ? (e: React.PointerEvent<HTMLButtonElement>) => {
              setFillOrigin(e)
              onPointerEnter?.(e)
            }
          : onPointerEnter
      }
      onPointerDown={
        withFill
          ? (e: React.PointerEvent<HTMLButtonElement>) => {
              setFillOrigin(e)
              onPointerDown?.(e)
            }
          : onPointerDown
      }
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
