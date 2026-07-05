"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field, FieldLabel } from "@/components/ui/field"

const WEEK_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1)

type QuestionDraft = {
  key: string
  question_text: string
  max_score: string
}

// SSR과 클라이언트 hydration이 같은 key를 만들도록 초기 문항은 상수 key를 쓴다
// (crypto.randomUUID()는 서버/클라이언트 값이 달라 hydration mismatch를 냈다).
// 추가 문항 key는 ref 카운터에서 발급 — 사용자 액션(클라이언트)에서만 실행된다.
const INITIAL_QUESTION: QuestionDraft = { key: "q-0", question_text: "", max_score: "10" }

/**
 * 시험 생성 폼 (admin 전용). POST /api/exams → 성공 시 토스트 + /exams 리다이렉트.
 * 문제는 텍스트 + 배점만 받는 서술형 전용 (PRD §4.2) — 동적으로 추가/삭제.
 */
function ExamForm() {
  const router = useRouter()
  const [title, setTitle] = React.useState("")
  const [week, setWeek] = React.useState("1")
  const [timeLimit, setTimeLimit] = React.useState("30")
  const [questions, setQuestions] = React.useState<QuestionDraft[]>([INITIAL_QUESTION])
  const [isPending, setIsPending] = React.useState(false)
  const nextQuestionKey = React.useRef(1)

  const addQuestion = () =>
    setQuestions((prev) => [
      ...prev,
      { key: `q-${nextQuestionKey.current++}`, question_text: "", max_score: "10" },
    ])

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    )
  }

  const removeQuestion = (key: string) => {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((q) => q.key !== key)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPending) return
    setIsPending(true)
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          week_number: Number(week),
          time_limit_minutes: Number(timeLimit),
          questions: questions.map((q) => ({
            question_text: q.question_text,
            max_score: Number(q.max_score),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "시험 생성에 실패했습니다.")
        return
      }
      toast.success("시험을 생성했습니다.")
      router.push("/exams")
      router.refresh()
    } catch {
      toast.error("네트워크 오류가 발생했습니다.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>시험 제목, 주차, 제한시간을 설정하세요.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="exam-title">제목</FieldLabel>
            <Input
              id="exam-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 3주차 중간 점검"
              maxLength={200}
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="exam-week">주차</FieldLabel>
              <Select value={week} onValueChange={setWeek}>
                <SelectTrigger id="exam-week" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEK_OPTIONS.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {w}주차
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="exam-time-limit">제한시간(분)</FieldLabel>
              <Input
                id="exam-time-limit"
                type="number"
                min={1}
                max={720}
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                required
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>문제</CardTitle>
          <CardDescription>서술형 문제와 배점을 입력하세요. (1개 이상)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {questions.map((q, i) => (
            <div
              key={q.key}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
                  문제 {i + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={questions.length <= 1}
                  onClick={() => removeQuestion(q.key)}
                  aria-label={`문제 ${i + 1} 삭제`}
                >
                  <TrashIcon />
                </Button>
              </div>
              <Textarea
                value={q.question_text}
                onChange={(e) => updateQuestion(q.key, { question_text: e.target.value })}
                placeholder="문제 지문을 입력하세요."
                className="min-h-24"
                maxLength={5000}
                required
              />
              <Field className="max-w-40">
                <FieldLabel htmlFor={`max-score-${q.key}`}>배점</FieldLabel>
                <Input
                  id={`max-score-${q.key}`}
                  type="number"
                  min={1}
                  max={100}
                  value={q.max_score}
                  onChange={(e) => updateQuestion(q.key, { max_score: e.target.value })}
                  required
                />
              </Field>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addQuestion}
            disabled={questions.length >= 50}
            className="self-start"
          >
            <PlusIcon data-icon="inline-start" />
            문제 추가
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending && <Spinner data-icon="inline-start" />}
          시험 생성
        </Button>
      </div>
    </form>
  )
}

export { ExamForm }
