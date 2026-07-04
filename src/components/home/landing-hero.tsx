import Link from "next/link"

import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"

/**
 * 로그아웃/미승인 방문자용 마케팅 히어로 (PRD §4.7 대상 아님 — 이전 page.tsx에서 추출).
 * 풀블리드 피치 밴드 + UbSE 워터마크는 디자인 헌법 랜딩 히어로 규격 그대로 유지한다.
 *
 * 원본에 있던 "자세히 보기" 보조 버튼은 제거했다 — 그 대상이던 #preview 데모 섹션이
 * 삭제되어 링크가 깨지는 데다, 사내 도구는 "둘러보기/살펴보기" 류 광고성 CTA를 두지
 * 않는다는 헌법 규칙(Non-negotiables)에도 위배되어 화면당 하나뿐인 실제 기능 버튼
 * (시작하기)만 남겼다.
 */
function LandingHero() {
  return (
    <section className="relative isolate overflow-hidden bg-band-peach pt-40 pb-24">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -right-16 z-0 hidden font-heading text-[24rem] leading-none font-extrabold tracking-[-0.05em] whitespace-nowrap text-[rgba(41,39,58,.06)] select-none sm:block"
      >
        UbSE
      </span>

      <Container className="relative z-10 flex flex-col gap-6">
        <h1 className="max-w-3xl text-[clamp(2.75rem,6vw+1rem,4.5rem)] leading-[1.0] font-extrabold tracking-[-0.045em] text-foreground">
          스터디 운영을 한 곳에서
        </h1>
        <p className="max-w-xl text-[22px] leading-[1.55] font-normal tracking-[-0.03em] text-muted-foreground">
          출석, 시험, 게시판, 랭킹까지 — UbSE 스터디 그룹을 위한 내부 운영
          도구입니다.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild size="lg">
            <Link href="/auth/login">시작하기</Link>
          </Button>
        </div>
      </Container>
    </section>
  )
}

export { LandingHero }
