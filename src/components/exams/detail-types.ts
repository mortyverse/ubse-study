import type { GradingStatus } from "@/lib/types"

export type MyAnswerView = {
  id: string
  question_id: string
  question_text: string
  order: number
  max_score: number
  answer_text: string | null
  ai_score: number | null
  ai_rationale: string | null
  final_score: number | null
  resolved_at: string | null
  hasOpenDispute: boolean
}

export type MyResultView = {
  submission: {
    id: string
    submitted_at: string | null
    grading_status: GradingStatus
  }
  answers: MyAnswerView[]
}

export type DisputeAnswerOwner = {
  display_name: string
  avatar_url: string | null
}

export type DisputeCommentView = {
  id: string
  content: string
  created_at: string
  author: DisputeAnswerOwner
}

export type DisputeView = {
  id: string
  status: "open" | "resolved"
  created_at: string
  answer: {
    id: string
    question_text: string | null
    max_score: number | null
    answer_text: string | null
    ai_score: number | null
    ai_rationale: string | null
    final_score: number | null
    resolved_at: string | null
    owner: DisputeAnswerOwner
  }
  comments: DisputeCommentView[]
}

export type AdminAnswerView = {
  id: string
  question_text: string
  order: number
  max_score: number
  answer_text: string | null
  ai_score: number | null
  ai_rationale: string | null
  final_score: number | null
  resolved_at: string | null
  hasOpenDispute: boolean
}

export type AdminSubmissionView = {
  id: string
  user: DisputeAnswerOwner
  submitted_at: string | null
  grading_status: GradingStatus
  answers: AdminAnswerView[]
}
