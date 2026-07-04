"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EmptyState } from "@/components/common/empty-state"
import { PostList } from "@/components/board/post-list"
import type { BoardListPost } from "@/components/board/types"
import type { BoardCategory } from "@/lib/types"

const TABS: { value: BoardCategory; label: string }[] = [
  { value: "free", label: "자유게시판" },
  { value: "material", label: "강의자료" },
  { value: "note", label: "필기노트" },
]

/**
 * 게시판 1메뉴 3탭 (PRD §4.5). 세 탭 데이터를 서버에서 한 번에 받아두고
 * 클라이언트에서 즉시 전환한다 — 재요청 없이 반응하되, ?tab= 쿼리는 계속
 * 갱신해 링크로 공유 가능하게 유지한다.
 */
function BoardTabs({
  initialTab,
  freePosts,
  materialPosts,
  notePosts,
  isAdmin,
}: {
  initialTab: BoardCategory
  freePosts: BoardListPost[]
  materialPosts: BoardListPost[]
  notePosts: BoardListPost[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState<BoardCategory>(initialTab)

  const handleChange = (value: string) => {
    const next = value as BoardCategory
    setTab(next)
    router.replace(`/board?tab=${next}`, { scroll: false })
  }

  return (
    <Tabs value={tab} onValueChange={handleChange}>
      <TabsList className="h-auto p-1">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="px-3 py-1.5">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="free" className="mt-6 flex flex-col gap-4">
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/board/new?category=free">글쓰기</Link>
          </Button>
        </div>
        {freePosts.length === 0 ? (
          <EmptyState
            title="등록된 글이 없습니다"
            description="글쓰기 버튼으로 자유게시판에 첫 글을 남겨 보세요."
          />
        ) : (
          <PostList category="free" posts={freePosts} />
        )}
      </TabsContent>

      <TabsContent value="material" className="mt-6 flex flex-col gap-4">
        {isAdmin && (
          <div className="flex justify-end">
            <Button asChild>
              <Link href="/board/new?category=material">자료 올리기</Link>
            </Button>
          </div>
        )}
        {materialPosts.length === 0 ? (
          <EmptyState
            title="등록된 강의자료가 없습니다"
            description={
              isAdmin
                ? "자료 올리기 버튼으로 첫 강의자료를 등록해 보세요."
                : "관리자가 강의자료를 등록하면 이곳에 표시됩니다."
            }
          />
        ) : (
          <PostList category="material" posts={materialPosts} />
        )}
      </TabsContent>

      <TabsContent value="note" className="mt-6 flex flex-col gap-4">
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/board/new?category=note">노트 쓰기</Link>
          </Button>
        </div>
        {notePosts.length === 0 ? (
          <EmptyState
            title="등록된 필기노트가 없습니다"
            description="노트 쓰기 버튼으로 첫 필기노트를 남겨 보세요."
          />
        ) : (
          <PostList category="note" posts={notePosts} />
        )}
      </TabsContent>
    </Tabs>
  )
}

export { BoardTabs }
