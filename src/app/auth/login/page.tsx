"use client";

import { useState } from "react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Container } from "@/components/layout/container";

export default function LoginPage() {
  const [isPending, setIsPending] = useState(false);

  const signInWithGitHub = async () => {
    setIsPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=/`,
      },
    });
    if (error) setIsPending(false);
  };

  return (
    <main className="relative flex flex-1 items-center overflow-hidden bg-band-lavender">
      <Container className="relative z-10 flex flex-col items-center gap-8 py-32 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl md:text-5xl">로그인</h1>
          <p className="max-w-md text-base text-muted-foreground">
            GitHub 계정으로 로그인합니다. 첫 로그인 후에는 관리자 승인이
            필요해요.
          </p>
        </div>
        <Button size="lg" onClick={signInWithGitHub} disabled={isPending}>
          {isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <GitHubLogoIcon data-icon="inline-start" />
          )}
          GitHub으로 로그인
        </Button>
      </Container>
    </main>
  );
}
