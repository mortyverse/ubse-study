import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth";
import { getActiveSession, getRoster } from "@/lib/attendance";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/common/page-header";
import { AttendanceView } from "@/components/attendance/attendance-view";
import type {
  MyRecord,
  RosterRow,
  SessionMeta,
} from "@/components/attendance/types";

export default async function AttendancePage() {
  const { userId, profile } = await getSessionProfile();
  // proxy가 이미 미승인/미로그인 사용자를 걸러내지만, 방어적으로 한 번 더 확인한다.
  if (!userId) redirect("/auth/login");
  if (!profile || profile.status !== "approved") redirect("/pending");

  const rawSession = await getActiveSession();
  // code 컬럼은 admin 전용 API로만 내려간다 — 여기서 즉시 제거한다.
  const session: SessionMeta = rawSession
    ? {
        id: rawSession.id,
        week_number: rawSession.week_number,
        duration_minutes: rawSession.duration_minutes,
        opened_at: rawSession.opened_at,
        closes_at: rawSession.closes_at,
        is_active: rawSession.is_active,
      }
    : null;

  let myRecord: MyRecord = null;
  let roster: RosterRow[] = [];

  if (session) {
    roster = await getRoster(session.id);
    const myRow = roster.find((r) => r.user.id === profile.id);
    myRecord = myRow?.recordId
      ? { id: myRow.recordId, status: myRow.status, checked_at: myRow.checked_at }
      : null;
  }

  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-10 pt-28 pb-20 md:pt-32">
        <PageHeader eyebrow="ATTENDANCE" title="출석" />
        <AttendanceView
          viewerId={profile.id}
          isAdmin={profile.role === "admin"}
          initialSession={session}
          initialMyRecord={myRecord}
          initialRoster={roster}
        />
      </Container>
    </main>
  );
}
