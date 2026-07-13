import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

/** 절대 URL(http/https 등)만 외부 링크로 취급 — 상대 경로/앵커는 내부 이동. */
function isExternalUrl(href: string | undefined): boolean {
  return !!href && /^[a-z][a-z0-9+.-]*:/i.test(href)
}

/**
 * 마크다운 렌더 영역 (게시글 상세 / 미리보기 공통).
 * @tailwindcss/typography는 추가하지 않고, 넉넉한 여백의 커스텀 스타일만 적용한다.
 * react-markdown 기본값 유지 — rehype-raw(원본 HTML 렌더)는 추가하지 않는다.
 */
function MarkdownContent({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div
      data-slot="markdown-content"
      className={cn(
        "text-base leading-7 text-foreground",
        "break-words [&>*+*]:mt-4",
        "[&_h1]:font-heading [&_h1]:text-2xl [&_h1]:leading-tight [&_h1]:font-bold [&_h1]:tracking-tight",
        "[&_h2]:font-heading [&_h2]:text-xl [&_h2]:leading-tight [&_h2]:font-bold [&_h2]:tracking-tight",
        "[&_h3]:font-heading [&_h3]:text-lg [&_h3]:leading-tight [&_h3]:font-bold",
        "[&_p]:leading-7",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary-hover",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-1",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[0.85em] [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:font-medium [&_td]:border [&_td]:border-border [&_td]:p-2",
        "[&_hr]:border-border",
        "[&_img]:max-w-full [&_img]:rounded-lg",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) =>
            isExternalUrl(href) ? (
              <a href={href} target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            ) : (
              <a href={href} {...props}>
                {children}
              </a>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export { MarkdownContent }
