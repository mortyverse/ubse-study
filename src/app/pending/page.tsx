import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export default async function PendingPage() {
  const { userId, profile } = await getSessionProfile();
  if (!userId) redirect("/auth/login");
  if (profile?.status === "approved") redirect("/");

  const isRejected = profile?.status === "rejected";

  return (
    <main className="flex-1 flex items-center">
      <Container className="flex flex-col items-center gap-8 py-32 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl md:text-5xl">
            {isRejected ? "가입이 거절되었습니다" : "승인 대기 중"}
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            {isRejected
              ? "관리자가 가입을 거절했습니다. 문의가 필요하면 스터디장에게 연락해 주세요."
              : "관리자가 가입을 확인하고 있어요. 승인이 완료되면 모든 기능을 사용할 수 있습니다."}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <Button size="lg" variant="outline" type="submit">
            로그아웃
          </Button>
        </form>
      </Container>
    </main>
  );
}
