import "server-only";

/**
 * Gemini 1차 채점 (PRD §4.2).
 * - 모델/thinking level은 PRD 고정값: gemini-3.1-flash-lite, medium 이상
 * - 채점은 비동기 백그라운드 작업이라 속도보다 정확도 우선
 * - 문항별 점수 + 채점 근거(rationale)를 구조화 JSON으로 받는다
 */

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const THINKING_LEVEL = "medium";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface AiGrade {
  score: number;
  rationale: string;
}

function buildPrompt(args: {
  questionText: string;
  maxScore: number;
  answerText: string;
}): string {
  return [
    "당신은 학부 연구생 스터디의 주관식 시험 채점자다. 아래 문제와 학생 답안을 채점하라.",
    "",
    "채점 규칙:",
    `- 만점은 ${args.maxScore}점이며, score는 0 이상 ${args.maxScore} 이하의 수(부분 점수 허용, 0.5 단위)여야 한다.`,
    "- 핵심 개념의 정확성을 우선 평가하고, 표현이 달라도 의미가 맞으면 인정한다.",
    "- rationale(채점 근거)은 한국어로 2~4문장. 어떤 부분이 맞고 틀렸는지, 감점 사유가 무엇인지 학생이 이의제기 여부를 판단할 수 있게 구체적으로 쓴다.",
    "- 답안이 문제와 무관하거나 비어 있으면 0점을 준다.",
    "",
    `문제: ${args.questionText}`,
    `배점: ${args.maxScore}점`,
    "",
    `학생 답안: ${args.answerText}`,
  ].join("\n");
}

/**
 * 문항 1개 채점. 실패 시 1회 재시도 후 throw — 호출부(gradeSubmission)가
 * grading_status='failed'로 기록한다. score는 [0, maxScore]로 클램프.
 */
export async function gradeAnswer(args: {
  questionText: string;
  maxScore: number;
  answerText: string | null;
}): Promise<AiGrade> {
  const answerText = args.answerText?.trim() ?? "";
  if (answerText === "") {
    return { score: 0, rationale: "답안이 제출되지 않아 0점 처리되었습니다." };
  }

  const body = {
    contents: [
      { parts: [{ text: buildPrompt({ ...args, answerText }) }] },
    ],
    generationConfig: {
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          score: { type: "NUMBER" },
          rationale: { type: "STRING" },
        },
        required: ["score", "rationale"],
      },
    },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.find(
        (p) => typeof p.text === "string",
      )?.text;
      if (!text) throw new Error("Gemini 응답에 텍스트가 없습니다.");

      const parsed = JSON.parse(text) as { score: unknown; rationale: unknown };
      const rawScore = Number(parsed.score);
      if (!Number.isFinite(rawScore) || typeof parsed.rationale !== "string") {
        throw new Error("Gemini 응답 스키마가 올바르지 않습니다.");
      }
      return {
        score: Math.min(Math.max(rawScore, 0), args.maxScore),
        rationale: parsed.rationale,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
