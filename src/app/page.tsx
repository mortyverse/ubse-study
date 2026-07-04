import Link from "next/link";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      {/* Full-bleed peach hero — the nav floats transparent over this band. */}
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
            <Button asChild size="lg" variant="outline">
              <Link href="#preview">자세히 보기</Link>
            </Button>
          </div>
        </Container>
      </section>

      {/* White section — component living sample + scroll-transition test area. */}
      <section id="preview" className="min-h-[80vh] bg-background">
        <Container className="flex flex-col gap-16 py-24">
          <PageHeader
            eyebrow="Preview"
            title="컴포넌트 미리보기"
            description="Phase 0.3 앱 셸 검증을 위한 임시 섹션입니다. 이 페이지는 Phase 3에서 실제 대시보드로 교체됩니다."
            actions={
              <Button asChild variant="outline">
                <Link href="/admin">관리자 메뉴로 이동</Link>
              </Button>
            }
          />

          <div className="flex flex-col gap-4">
            <h2 className="text-xl">출석 상태 배지</h2>
            <div className="flex flex-wrap gap-3">
              <StatusBadge status="present" />
              <StatusBadge status="late" />
              <StatusBadge status="absent" />
            </div>
          </div>

          <EmptyState
            title="아직 등록된 항목이 없습니다"
            description="관리자가 항목을 추가하면 여기에 표시됩니다."
          />
        </Container>
      </section>
    </>
  );
}
