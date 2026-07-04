import { cn } from "@/lib/utils"

/**
 * Shared page container. The nav's inner content and every page section use
 * this SAME max-width + horizontal gutter so the "Study" wordmark's left
 * edge always lines up with the page content's left edge (CLAUDE.md nav
 * alignment rule). Keep horizontal padding here and vertical padding on the
 * caller (e.g. a full-bleed band) so they never collide — see the
 * padding-shorthand pitfall noted in the design constitution.
 */
function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="container"
      className={cn("mx-auto w-full max-w-[1200px] px-8", className)}
      {...props}
    />
  )
}

export { Container }
