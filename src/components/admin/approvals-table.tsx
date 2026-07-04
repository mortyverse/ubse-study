"use client"

import * as React from "react"
import { toast } from "sonner"

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/common/empty-state"

export type PendingUser = {
  id: string
  display_name: string
  github_username: string | null
  avatar_url: string | null
  status: string
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** 가입 승인 대기 목록 — 낙관적 제거 + sonner 토스트. */
function ApprovalsTable({ initialUsers }: { initialUsers: PendingUser[] }) {
  const [users, setUsers] = React.useState(initialUsers)
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const handleAction = async (user: PendingUser, action: "approve" | "reject") => {
    setPendingId(user.id)
    try {
      const res = await fetch(`/api/admin/approvals/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "처리에 실패했습니다.")
        return
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      toast.success(
        action === "approve"
          ? `${user.display_name}님을 승인했습니다.`
          : `${user.display_name}님을 거절했습니다.`
      )
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setPendingId(null)
    }
  }

  if (users.length === 0) {
    return (
      <EmptyState
        title="대기 중인 가입 신청이 없습니다"
        description="새로운 신청이 들어오면 이곳에 표시됩니다."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>이름</TableHead>
            <TableHead>GitHub</TableHead>
            <TableHead>가입일</TableHead>
            <TableHead className="text-right">처리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="hover:bg-accent/40">
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarImage src={user.avatar_url ?? undefined} alt={user.display_name} />
                    <AvatarFallback>{user.display_name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">{user.display_name}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.github_username ? `@${user.github_username}` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(user.created_at)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pendingId === user.id}
                    onClick={() => handleAction(user, "approve")}
                  >
                    승인
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pendingId === user.id}
                    onClick={() => handleAction(user, "reject")}
                  >
                    거절
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export { ApprovalsTable }
