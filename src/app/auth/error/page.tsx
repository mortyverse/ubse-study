import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export default function AuthErrorPage() {
  return (
    <main className="flex flex-1 items-center">
      <Container className="flex flex-col items-center gap-8 py-32 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl md:text-5xl">로그인에 실패했습니다</h1>
          <p className="max-w-md text-base text-muted-foreground">
            인증 과정에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        </div>
        <Button size="lg" asChild>
          <Link href="/auth/login">다시 로그인</Link>
        </Button>
      </Container>
    </main>
  );
}
