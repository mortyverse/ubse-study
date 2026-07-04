import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { buildRanking } from "@/lib/ranking";

/** 전체 랭킹 (승인 멤버 누구나 — 실명 전체 공개, PRD §4.4) */
export async function GET() {
  const { error } = await requireApproved();
  if (error) return error;

  const ranking = await buildRanking();
  return NextResponse.json(ranking);
}
