"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HamburgerMenuIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { Container } from "@/components/layout/container"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"

// "메인" 링크는 두지 않는다 — 로고 클릭이 홈으로 간다
const NAV_LINKS = [
  { href: "/attendance", label: "출석" },
  { href: "/exams", label: "시험" },
  { href: "/board", label: "게시판" },
  { href: "/me", label: "마이페이지" },
] as const

/** layout.tsx(서버 컴포넌트)가 getSessionProfile() 결과를 직렬화해 넘기는 최소 프로필 */
type NavUser = {
  displayName: string
  avatarUrl: string | null
  role: "admin" | "member"
  status: "pending" | "approved" | "rejected"
} | null

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
            "text-base font-medium tracking-[-0.01em] text-foreground transition-colors hover:text-primary",
            isActive(pathname, link.href) && "text-primary"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

/** 로그인된 사용자의 아바타 + 드롭다운(로그아웃). 데스크톱 클러스터 우측 끝에 위치. */
function AccountMenu({ user }: { user: NonNullable<NavUser> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="계정 메뉴"
          className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Avatar>
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
            <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel className="font-normal text-foreground">
          {user.displayName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/auth/signout" method="post" className="w-full">
            <button type="submit" className="w-full text-left">
              로그아웃
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SiteNav({ user = null }: { user?: NavUser }) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const showAdminLink = user?.role === "admin" && user.status === "approved"

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
          className="font-heading text-2xl font-extrabold tracking-[-0.03em] text-foreground"
        >
          Study
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <NavLinks pathname={pathname} />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {showAdminLink && (
              <Button asChild variant="outline">
                <Link href="/admin">관리자 메뉴</Link>
              </Button>
            )}
            {user ? (
              <AccountMenu user={user} />
            ) : (
              <Button asChild>
                <Link href="/auth/login">시작하기</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
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
                  className="flex-col items-start gap-5 [&>a]:text-lg"
                />
              </SheetClose>
              <div className="mt-auto flex flex-col gap-3 pb-4">
                {user && (
                  <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <Avatar size="sm">
                      <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
                      <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground">
                      {user.displayName}
                    </span>
                  </div>
                )}
                {showAdminLink && (
                  <SheetClose asChild>
                    <Button asChild variant="outline">
                      <Link href="/admin">관리자 메뉴</Link>
                    </Button>
                  </SheetClose>
                )}
                {user ? (
                  <form action="/auth/signout" method="post">
                    <Button type="submit" variant="outline" className="w-full">
                      로그아웃
                    </Button>
                  </form>
                ) : (
                  <SheetClose asChild>
                    <Button asChild>
                      <Link href="/auth/login">시작하기</Link>
                    </Button>
                  </SheetClose>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </Container>
    </header>
  )
}

export { SiteNav, type NavUser }
