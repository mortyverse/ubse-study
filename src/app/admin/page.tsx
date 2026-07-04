import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { ApprovalsTable } from "@/components/admin/approvals-table";

export default async function AdminPage() {
  const { userId, profile } = await getSessionProfile();
  // proxy가 이미 /admin을 admin이 아닌 사용자로부터 리다이렉트하지만, 방어적으로 재확인한다.
  if (!userId) redirect("/auth/login");
  if (!profile || profile.status !== "approved") redirect("/pending");
  if (profile.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: pendingUsers } = await supabase
    .from("users")
    .select("id, display_name, github_username, avatar_url, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-10 pt-28 pb-20 md:pt-32">
        <PageHeader eyebrow="ADMIN" title="가입 승인 관리" />
        <ApprovalsTable initialUsers={pendingUsers ?? []} />
      </Container>
    </main>
  );
}
