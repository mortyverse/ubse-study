import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface QuestionInput {
  question_text: string;
  max_score: number;
}

/** 시험 생성 (admin 전용): 문제(텍스트)·배점·제한시간(분) — PRD §4.2 */
export async function POST(request: Request) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    week_number?: unknown;
    time_limit_minutes?: unknown;
    questions?: unknown;
  } | null;

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const weekNumber = body?.week_number;
  const timeLimit = body?.time_limit_minutes;
  const rawQuestions = body?.questions;

  if (title === "" || title.length > 200) {
    return NextResponse.json({ error: "제목을 입력해 주세요. (200자 이내)" }, { status: 400 });
  }
  if (
    typeof weekNumber !== "number" ||
    !Number.isInteger(weekNumber) ||
    weekNumber < 1 ||
    weekNumber > 10
  ) {
    return NextResponse.json(
      { error: "week_number는 1–10 사이의 정수여야 합니다." },
      { status: 400 },
    );
  }
  if (
    typeof timeLimit !== "number" ||
    !Number.isInteger(timeLimit) ||
    timeLimit < 1 ||
    timeLimit > 720
  ) {
    return NextResponse.json(
      { error: "time_limit_minutes는 1–720 사이의 정수여야 합니다." },
      { status: 400 },
    );
  }
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0 || rawQuestions.length > 50) {
    return NextResponse.json(
      { error: "문제를 1개 이상 50개 이하로 입력해 주세요." },
      { status: 400 },
    );
  }

  const questions: QuestionInput[] = [];
  for (const q of rawQuestions as Array<Record<string, unknown>>) {
    const text = typeof q?.question_text === "string" ? q.question_text.trim() : "";
    const maxScore = q?.max_score;
    if (text === "" || text.length > 5000) {
      return NextResponse.json(
        { error: "각 문제의 지문을 입력해 주세요. (5000자 이내)" },
        { status: 400 },
      );
    }
    if (
      typeof maxScore !== "number" ||
      !Number.isInteger(maxScore) ||
      maxScore < 1 ||
      maxScore > 100
    ) {
      return NextResponse.json(
        { error: "각 문제의 배점은 1–100 사이의 정수여야 합니다." },
        { status: 400 },
      );
    }
    questions.push({ question_text: text, max_score: maxScore });
  }

  const admin = createAdminClient();
  const { data: exam, error: examError } = await admin
    .from("exams")
    .insert({
      title,
      week_number: weekNumber,
      time_limit_minutes: timeLimit,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (examError || !exam) {
    return NextResponse.json(
      { error: examError?.message ?? "시험 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  const { error: questionsError } = await admin.from("exam_questions").insert(
    questions.map((q, i) => ({
      exam_id: exam.id,
      question_text: q.question_text,
      max_score: q.max_score,
      order: i + 1,
    })),
  );

  if (questionsError) {
    // 문제 생성 실패 시 시험 롤백 (0004 시딩 롤백과 동일 패턴)
    await admin.from("exams").delete().eq("id", exam.id);
    return NextResponse.json(
      { error: "문제 생성에 실패해 시험을 취소했습니다. 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ exam }, { status: 201 });
}
