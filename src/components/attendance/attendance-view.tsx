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
 *   폴링 응답에 로스터 전체 스냅샷이 실리므로 Realtime이 놓친 변경도 따라잡는다.
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

  const refetchSession = React.useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/sessions", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as {
        session: SessionMeta
        myRecord: MyRecord
        roster: RosterRow[]
      }
      setSession(data.session)
      setMyRecord(data.myRecord)
      if (data.session) setRoster(data.roster ?? [])
    } catch {
      // 일시적 네트워크 오류 — 다음 폴링에서 재시도
    }
  }, [])

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
    let disposed = false

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

    // 로그인 JWT가 Realtime 소켓에 실리기 전에 조인하면 anon 권한으로 검사되어
    // 구독이 거부된다(anon은 attendance_records에 GRANT가 없음 — 서버 로그의
    // "invalid column for filter session_id"가 이 케이스). 토큰을 먼저 심고 구독한다.
    const subscribeWithAuth = async () => {
      const { data } = await supabase.auth.getSession()
      if (disposed) return
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (disposed) return
      channel.subscribe(async (status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // 조인 거부/만료 시 최신 토큰으로 갱신 — 내장 rejoin이 새 토큰으로 재시도
          const { data: fresh } = await supabase.auth.getSession()
          if (!disposed) {
            await supabase.realtime.setAuth(fresh.session?.access_token ?? null)
          }
        }
      })
    }
    void subscribeWithAuth()

    return () => {
      disposed = true
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
            // 세션 시작 시 서버가 전원 결석 레코드를 시딩하므로 로스터를 즉시 받아온다
            void refetchSession()
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
