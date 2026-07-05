import { LockClosedIcon } from "@radix-ui/react-icons"

import { Container } from "@/components/layout/container"

/**
 * 로그아웃 방문자용 잠금 섹션 — 실제 데이터 대신 흐릿한 스켈레톤 위에
 * "로그인 후 이용할 수 있습니다" 안내를 얹는다. 섹션 구조(풀페이지 스냅)는
 * 로그인 화면과 동일하게 유지해 서비스의 원래 모습을 짐작할 수 있게 한다.
 */
function LockedSection({ title }: { title: string }) {
  return (
    <Container className="flex min-h-full flex-col items-center justify-center gap-8 py-24">
      <h2 className="text-center text-3xl">{title}</h2>

      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div aria-hidden className="flex flex-col gap-4 blur-[3px] select-none">
          <div className="h-5 w-2/5 rounded-full bg-muted" />
          <div className="h-4 w-full rounded-full bg-muted" />
          <div className="h-4 w-5/6 rounded-full bg-muted" />
          <div className="h-4 w-3/4 rounded-full bg-band-lavender" />
          <div className="h-4 w-4/6 rounded-full bg-muted" />
          <div className="h-4 w-1/2 rounded-full bg-muted" />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/55 text-center backdrop-blur-[2px]">
          <LockClosedIcon className="mb-2 size-5 text-muted-foreground" />
          <p className="font-medium text-foreground">로그인 후 이용할 수 있습니다</p>
          <p className="text-sm text-muted-foreground">
            GitHub 계정으로 로그인하고 관리자 승인을 받으면 열립니다.
          </p>
        </div>
      </div>
    </Container>
  )
}

export { LockedSection }
