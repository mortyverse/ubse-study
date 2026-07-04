"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HamburgerMenuIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"

const NAV_LINKS = [
  { href: "/", label: "메인" },
  { href: "/attendance", label: "출석" },
  { href: "/exams", label: "시험" },
  { href: "/board", label: "게시판" },
  { href: "/me", label: "마이페이지" },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLinks({
  pathname,
  className,
}: {
  pathname: string
  className?: string
}) {
  return (
    <nav className={cn("flex items-center gap-6", className)}>
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(pathname, link.href) ? "page" : undefined}
          className={cn(
            "text-sm font-normal tracking-[-0.01em] text-foreground transition-colors hover:text-primary",
            isActive(pathname, link.href) && "text-primary"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

function SiteNav() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      data-slot="site-nav"
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-[72px] border-b border-transparent bg-transparent transition-[background-color,border-color] duration-200",
        scrolled &&
          "border-black/10 bg-background dark:bg-card"
      )}
    >
      <Container className="flex h-full items-center justify-between">
        <Link
          href="/"
          className="font-heading text-xl font-extrabold tracking-[-0.03em] text-foreground"
        >
          Study
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <NavLinks pathname={pathname} />
          <div className="flex items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/admin">관리자 메뉴</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/login">시작하기</Link>
            </Button>
          </div>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="메뉴 열기"
            >
              <HamburgerMenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col">
            <SheetHeader>
              <SheetTitle>메뉴</SheetTitle>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-6 px-4">
              <SheetClose asChild>
                <NavLinks
                  pathname={pathname}
                  className="flex-col items-start gap-5"
                />
              </SheetClose>
              <div className="mt-auto flex flex-col gap-2 pb-4">
                <SheetClose asChild>
                  <Button asChild variant="outline">
                    <Link href="/admin">관리자 메뉴</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild>
                    <Link href="/auth/login">시작하기</Link>
                  </Button>
                </SheetClose>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </Container>
    </header>
  )
}

export { SiteNav }
