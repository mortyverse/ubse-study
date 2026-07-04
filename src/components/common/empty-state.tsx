import Link from "next/link"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"

type EmptyStateAction = {
  label: string
  href?: string
  onClick?: () => void
}

function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: EmptyStateAction
  className?: string
}) {
  return (
    <Empty className={cn("gap-3 py-16", className)}>
      <EmptyHeader>
        <EmptyTitle className="font-heading text-lg font-bold tracking-tight text-foreground">
          {title}
        </EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && (
        <EmptyContent>
          {action.href ? (
            <Button asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  )
}

export { EmptyState }
