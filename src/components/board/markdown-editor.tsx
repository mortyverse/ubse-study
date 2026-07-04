"use client"

import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MarkdownContent } from "@/components/board/markdown-content"

/**
 * 필기노트 마크다운 에디터 — 작성/미리보기 탭 (PRD §4.5, 필기노트는 마크다운
 * 작성+인앱 렌더). 코드 블록은 textarea에서도 font-mono로 표시한다.
 */
function MarkdownEditor({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <Tabs defaultValue="write">
      <TabsList>
        <TabsTrigger value="write">작성</TabsTrigger>
        <TabsTrigger value="preview">미리보기</TabsTrigger>
      </TabsList>
      <TabsContent value="write" className="mt-3">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="min-h-64 font-mono text-sm"
          required
        />
      </TabsContent>
      <TabsContent value="preview" className="mt-3">
        <div className="min-h-64 rounded-lg border border-border p-4">
          {value.trim() ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">
              미리볼 내용이 없습니다. 작성 탭에서 마크다운을 입력하세요.
            </p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}

export { MarkdownEditor }
