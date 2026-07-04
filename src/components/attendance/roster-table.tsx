"use client"

import { toast } from "sonner"
import { DotsHorizontalIcon } from "@radix-ui/react-icons"

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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { StatusBadge, type AttendanceStatus } from "@/components/common/status-badge"
import type { RosterRow } from "@/components/attendance/types"

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "출석" },
  { value: "late", label: "지각" },
  { value: "absent", label: "결석" },
]

/**
 * 전원 로스터. 기본값은 결석이며 Realtime INSERT/UPDATE로 실시간 갱신된다.
 * 관리자에게만 행별 상태 수동 조정 드롭다운이 보인다.
 */
function RosterTable({
  roster,
  isAdmin,
  onOverride,
}: {
  roster: RosterRow[]
  isAdmin: boolean
  onOverride: (updated: {
    id: string
    status: AttendanceStatus
    checked_at: string | null
  }) => void
}) {
  const handleOverride = async (recordId: string, status: AttendanceStatus) => {
    try {
      const res = await fetch(`/api/attendance/records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "상태 변경에 실패했습니다.")
        return
      }
      onOverride(data.record)
      toast.success("출석 상태를 변경했습니다.")
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>이름</TableHead>
            <TableHead className="text-center">상태</TableHead>
            {isAdmin && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((row) => (
            <TableRow key={row.user.id} className="hover:bg-accent/40">
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarImage
                      src={row.user.avatar_url ?? undefined}
                      alt={row.user.display_name}
                    />
                    <AvatarFallback>{row.user.display_name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">
                    {row.user.display_name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <StatusBadge status={row.status} />
              </TableCell>
              {isAdmin && (
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={!row.recordId}
                        aria-label={`${row.user.display_name} 출석 상태 변경`}
                      >
                        <DotsHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {STATUS_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.value}
                          disabled={!row.recordId}
                          onSelect={() =>
                            row.recordId && handleOverride(row.recordId, opt.value)
                          }
                        >
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export { RosterTable }
