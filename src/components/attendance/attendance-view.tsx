"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import { EmptyState } from "@/components/common/empty-state"
import { AdminSessionPanel } from "@/components/attendance/admin-session-panel"
import { CheckinCard } from "@/components/attendance/checkin-card"
import { RosterTable } from "@/components/attendance/roster-table"
import type {
  MyRecord,
  RosterRow,
  SessionMeta,
} from "@/components/attendance/types"

const POLL_INTERVAL_MS = 20_000

type RecordRow = {
  id: string
  user_id: string
  status: "present" | "late" | "absent"
  checked_at: string | null
}

/**
 * 출석 페이지 오케스트레이터.
 * - Realtime에는 세션 시작/종료 자체가 실리지 않으므로(publication은 attendance_records만)
 *   20초 간격 폴링 + closes_at 도달 시 즉시 재조회로 세션 상태 전환을 감지한다.
 * - 활성 세션이 있을 때만 해당 session_id로 필터링한 attendance_records
 *   INSERT/UPDATE를 구독해 로스터를 실시간 반영한다.
 */
function AttendanceView({
  viewerId,
  isAdmin,
  initialSession,
  initialMyRecord,
  initialRoster,
}: {
  viewerId: string
  isAdmin: boolean
  initialSession: SessionMeta
  initialMyRecord: MyRecord
  initialRoster: RosterRow[]
}) {
  const [session, setSession] = React.useState<SessionMeta>(initialSession)
  const [myRecord, setMyRecord] = React.useState<MyRecord>(initialMyRecord)
  const [roster, setRoster] = React.useState<RosterRow[]>(initialRoster)
  const sessionIdRef = React.useRef<string | null>(initialSession?.id ?? null)

  const resetRosterForNewSession = React.useCallback(() => {
    setRoster((prev) =>
      prev.map((row) => ({
        ...row,
        status: "absent" as const,
        checked_at: null,
        recordId: null,
      }))
    )
  }, [])

  const refetchSession = React.useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/sessions", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as {
        session: SessionMeta
        myRecord: MyRecord
      }
      setSession(data.session)
      setMyRecord(data.myRecord)
      if ((data.session?.id ?? null) !== sessionIdRef.current) {
        sessionIdRef.current = data.session?.id ?? null
        resetRosterForNewSession()
      }
    } catch {
      // 일시적 네트워크 오류 — 다음 폴링에서 재시도
    }
  }, [resetRosterForNewSession])

  // 세션 시작/종료 감지용 폴링 (서버 시간이 유일한 권위 — 클라이언트는 표시용)
  React.useEffect(() => {
    const id = setInterval(refetchSession, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refetchSession])

  // closes_at 도달 시 즉시 재조회 (이미 지났으면 다음 틱에 바로 재조회)
  React.useEffect(() => {
    if (!session?.closes_at) return
    const remaining = new Date(session.closes_at).getTime() - Date.now()
    const t = setTimeout(refetchSession, Math.max(remaining + 500, 0))
    return () => clearTimeout(t)
  }, [session?.closes_at, refetchSession])

  // Realtime: 활성 세션의 attendance_records만 구독
  React.useEffect(() => {
    if (!session?.id) return
    const supabase = createClient()
    const sessionId = session.id

    const applyChange = (row: RecordRow) => {
      setRoster((prev) =>
        prev.map((r) =>
          r.user.id === row.user_id
            ? { ...r, status: row.status, checked_at: row.checked_at, recordId: row.id }
            : r
        )
      )
      if (row.user_id === viewerId) {
        setMyRecord({ id: row.id, status: row.status, checked_at: row.checked_at })
      }
    }

    const channel = supabase
      .channel(`attendance-records-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance_records",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => applyChange(payload.new as RecordRow)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "attendance_records",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => applyChange(payload.new as RecordRow)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.id, viewerId])

  const hasSession = Boolean(session)

  return (
    <div className="flex flex-col gap-10">
      {isAdmin && (
        <AdminSessionPanel
          session={session}
          onStarted={(started) => {
            setSession(started)
            sessionIdRef.current = started.id
            resetRosterForNewSession()
          }}
        />
      )}

      {!hasSession && (
        <EmptyState
          title="진행 중인 출석 세션이 없습니다"
          description="관리자가 출석 세션을 시작하면 이곳에 코드 입력창이 표시됩니다."
        />
      )}

      {session && (
        <CheckinCard
          session={session}
          myRecord={myRecord}
          onChecked={(record) => {
            setMyRecord(record)
            setRoster((prev) =>
              prev.map((r) =>
                r.user.id === viewerId
                  ? {
                      ...r,
                      status: record.status,
                      checked_at: record.checked_at,
                      recordId: record.id,
                    }
                  : r
              )
            )
          }}
        />
      )}

      {session && (
        <RosterTable
          roster={roster}
          isAdmin={isAdmin}
          onOverride={(updated) => {
            setRoster((prev) =>
              prev.map((r) =>
                r.recordId === updated.id
                  ? { ...r, status: updated.status, checked_at: updated.checked_at }
                  : r
              )
            )
            setMyRecord((prevMy) =>
              prevMy && prevMy.id === updated.id
                ? { ...prevMy, status: updated.status, checked_at: updated.checked_at }
                : prevMy
            )
          }}
        />
      )}
    </div>
  )
}

export { AttendanceView }
