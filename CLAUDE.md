@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Study-management web app for a Claude Code "vibe coding" study group (undergraduate research students). **Phases 0–4 are complete** (기반/출석/시험+AI채점/대시보드/게시판 — progress checklist in `docs/IMPLEMENTATION_PLAN.md`); Phase 5 (prod deploy) remains. Migrations `supabase/migrations/0001–0012` must be promoted to prod in order during Phase 5.

**`docs/PRD.md` is the source of truth.** It is written in Korean and every requirement is decided. Do not improvise on ambiguous points — follow the PRD literally, and reference it as `@docs/PRD.md`.

## Tech stack (do not substitute)

- **Framework**: Next.js (App Router) + TypeScript, deployed to Vercel
- **Backend**: Next.js Route Handlers / API Routes
- **UI**: Tailwind CSS + shadcn/ui — do not swap in another component/UI library
- **Auth**: Supabase Auth via GitHub OAuth
- **DB**: Supabase PostgreSQL, integrated with `@supabase/ssr`
- **Realtime**: Supabase Realtime (attendance code broadcast + roster updates)
- **Storage**: Supabase Storage (file attachments, e.g. lecture-material PDFs)
- **AI grading**: Gemini API, model `gemini-3.1-flash-lite`, thinking level `medium`+

## Database workflow (critical)

Never create or edit tables in the Supabase dashboard by hand. All schema is built by Claude Code through the **Supabase MCP server** (`list_tables`, `execute_sql`, `apply_migration`).

- Write `CREATE TABLE` + indexes + **RLS policies** as numbered SQL migrations in `supabase/migrations/` (e.g. `0001_create_users.sql`) so history is tracked in git.
- Schema changes = new migration file, never a dashboard edit.
- **Two Supabase projects exist**: `study-site-dev` and `study-site-prod`. MCP connects to **dev only** — never touch prod directly. Validated dev migrations are promoted to prod by a separate manual step. Vercel prod env vars point at prod.
- Access tokens / API keys (Supabase, Gemini) live in env vars only — never committed.

## Core architecture & non-negotiable rules

**Authorization is enforced at three layers, not just the frontend.** Every access rule must hold in (1) frontend routing guards, (2) API Route checks, and (3) Supabase RLS policies. Frontend-only guards are treated as bypassable. RLS policies Claude generates are re-reviewed by the admin.

**Approval gate.** GitHub OAuth login alone does not grant access. First login creates a `users` row with `status='pending'`; pending users see only a "승인 대기 중" screen and are blocked at the API+RLS layer. Admin approves (`approved`) / rejects (`rejected`) via the admin menu. There is always exactly **one** `admin` in the system; everyone else is `member`.

**Server time is authoritative for all time constraints.** Attendance close time and exam time limits are computed server-side. Do not trust the client / `localStorage` for remaining time.

**Attendance (4.1) — code secrecy.** Admin starts a session with a random 4-digit code and a `duration_minutes` of 1–5 (validate the 1–5 range server-side too). The code is returned only to `admin`-role clients (enforced in API + RLS); members see only an input box, and code verification happens in the API Route. Roster status changes propagate live via Realtime. Default status is 결석(absent); 출석/지각 are set from there.

**Exam grading (4.2) — two-stage.** On submit, the server calls Gemini to produce a **1st-draft** per-question score **plus a rationale**, stored async ("채점 중" → result). Members can file disputes (이의제기) that others comment on. The **admin always holds final scoring authority** and can flip correct↔incorrect both ways. Only the admin's **final** score — never the AI draft — feeds totals, attendance-rate, and ranking.

**Ranking is fully public by real name** (4.4) — there is no anonymization feature. Total score = summed exam scores + attendance rate with an admin-configurable weight.

## Feature-to-navigation map

The nav bar order is fixed (PRD §5). Some features are merged into single pages — do not create separate pages the PRD folds together:

1. **메인 (dashboard)** — stats dashboard **and** the full weekly-plan table with progress toggles (4.3, 4.7). Weekly plans have no separate page. Attendance status is NOT shown here.
2. **출석** — attendance check + roster (4.1)
3. **시험** — exam list / taking / grading & dispute discussion (4.2)
4. **마이페이지** — personal stats **and** the full public ranking table, GitHub/project links (4.4). No separate "ranking" menu.
5. **게시판** — one menu, three tabs: 자유게시판 / 강의자료 / 필기노트 (4.5). 필기노트 is markdown authored+rendered in-app.
6. **관리자 메뉴** (admin-only) — signup approval (4.6)

## Design system (CONSTITUTION — do not deviate)

The entire UI must read as a **Coda.io-inspired** product: warm, editorial, calm, and slightly playful — *not* a generic blue SaaS dashboard. This section is binding. Every screen, component, and one-off style MUST resolve to the tokens below. If a design need isn't covered here, extend the token set in a PR — never hardcode an off-palette value in a component.

**Aesthetic north star:** clean white canvas, plum-ink text, a single muted-violet accent, generous whitespace, large confident headings, soft rounded corners, and barely-there shadows. Color is used *sparingly* — mostly ink-on-white, with violet reserved for the one primary action per view, and soft pastel bands (peach/lavender/pink) for section rhythm. Think Coda / Notion / Linear warmth, not Bootstrap.

### Color palette (source of truth)

Canonical light theme. **`src/app/globals.css`가 단일 소스** — 여기 값과 어긋나면 globals.css가 이긴다.

| Role | Name | Hex | Usage |
|---|---|---|---|
| `--background` | White | `#FFFFFF` | app canvas / page background |
| `--card` / surface | White | `#FFFFFF` | cards, panels, nav bar, inputs |
| `--foreground` | Plum ink | `#29273A` | primary text, headings |
| `--muted-foreground` | Readable slate | `#55566B` | secondary text, captions, table meta |
| `--border` | Lavender hairline | `#E6E4EC` | hairline borders, dividers (never pure gray) |
| `--primary` | Muted violet ★ | `#7365A6` | primary buttons, active nav, key links — **화면당 1개** |
| primary hover | Deep violet | `#5E5190` | hover/pressed state of primary |
| `--destructive` | Rose | `#C7495A` | destructive/reject actions, errors |
| `--ring` | violet @ 45% | `rgba(115,101,166,.45)` | focus rings |

**Section bands** (히어로/섹션 배경 리듬 — 연속 컬러 밴드 금지): `--band-peach #F2CCB6` ★ · `--band-peach-light #F7DFCB` · `--band-lavender #EDEAF5` · `--band-pink #FBE3F7`.

**Chart palette** (`--chart-1..6`, use in order): `#7365A6` violet(본인 데이터) · `#F5B0F0` spark pink(장식 전용, 텍스트 금지) · `#BF8D7A` terracotta · `#6D6F8C` slate(전체 평균) · `#4E9E81` sage green · `#D9A441` amber.

**Attendance status** (`--status-*`): 출석 → `#4E9E81` · 지각 → `#BF8D7A` · 결석(기본값) → `#6D6F8C`.

Dark mode exists in globals.css (`.dark`): warm plum-black canvas `#221f2e`-계열, violet은 밝은 `#9B8FCB`로 승격 — never a cold `#0F172A` slate dark.

### Typography

- **Display/headings:** `Hanken Grotesk` (via `next/font`, `--font-hanken-grotesk` → `font-heading`) with **tight tracking** (`-0.03em`) and weight `700`. Headings are large and set close.
- **Body:** `Inter`, weight `400`, `line-height 1.6`, color `--foreground`.
- **Mono** (code, the 4-digit attendance code, 필기노트 code blocks): `JetBrains Mono` or `ui-monospace`.
- Scale (rem): display `3rem`/`2.25rem`, h1 `1.875`, h2 `1.5`, h3 `1.25`, body `1`, small `0.875`, caption `0.75`. Headings weight `700`, body `400`, labels `500`.
- Do not introduce a third typeface — Hanken Grotesk (headings) + Inter (body)가 전부다.

### Shape, elevation, spacing

- **Radius:** cards/panels/modals `16px` (`rounded-2xl`), inputs/buttons `10px` (`rounded-[10px]`), badges/pills `9999px`. Set shadcn `--radius: 0.625rem`. Nothing sharp-cornered.
- **Buttons are pill-to-soft:** primary = solid violet fill, white text, `rounded-[10px]`, medium weight, no gradient. Secondary = white surface + `--border` hairline + ink text. Ghost = transparent, ink text, lavender hover. Exactly **one** primary (violet) button per view — everything else is secondary/ghost.
- **Shadows are soft and low:** `shadow-sm` = `0 1px 2px rgba(16,16,16,.04)`, `shadow-md` = `0 4px 16px rgba(16,16,16,.06)`. Never dark/harsh drop shadows. Elevation comes from hairline borders and band contrast, not heavy shadow.
- **Spacing:** 4px base grid; generous section padding (`py-16`+ on marketing-ish/dashboard sections, `p-6` inside cards). Whitespace is a feature — do not crowd.
- **Borders:** 1px, `--border` warm sand, used more than shadows to separate surfaces.

### Layout & navigation

- **Top nav bar** (matches PRD §5 six items): white surface, hairline bottom border, sticky, logo left, nav items center/left, avatar + role menu right. Active item marked with violet text — not a boxed highlight.
- Content sits inside a `max-w-6xl` centered container with comfortable gutters; pastel bands give sections rhythm.
- **Tables** (roster, ranking, weekly plan): white surface, `#E6E4EC` hairline row dividers, no zebra stripes by default; hover row = faint lavender tint (`accent`). Rank/status shown via the category-accent badges above.
- Fully responsive (PRD §7): nav collapses to a sheet/hamburger on mobile; attendance code entry must be thumb-friendly.

### Component rules (shadcn/ui)

- Build every component from **shadcn/ui** primitives, then restyle via the CSS-variable tokens above — do not fork in raw one-off colors. Adding a component: `npx shadcn@latest add <name>`, then confirm it inherits the tokens (violet primary, lavender borders, 16px card radius).
- Charts (dashboard, 마이페이지 score trends) use the category-accent palette in order; violet(`--chart-1`) for the user's own line, slate(`--chart-4`) dashed for the group average. Grid lines `--border`, no heavy axes.
- Empty states, "승인 대기 중" screen, "채점 중" state: centered, generous whitespace, one line of ink text + one muted subline + at most one violet action. Keep them calm, not loud.

The rule of thumb for any new screen: **white canvas, pastel band rhythm, plum-ink text, violet used once.** If a mockup looks like default Bootstrap/Material blue, it is wrong.

## DB tables

Table definitions are in `docs/PRD.md` §4 (per feature). Use them as the basis; freely add housekeeping columns (`created_at`, `updated_at`). Seed data for the 10-week curriculum (`weekly_plans`) and the exam-answer/dispute chain are spelled out there.

## Build order

Implement in phases with **separate commits per phase** (PRD §8):
1. Auth (GitHub OAuth + admin approval flow) + attendance
2. Online exam (AI draft grading + dispute flow) + 마이페이지 (scores/attendance/ranking/projects)
3. Main dashboard (stats + weekly-plan table/progress)
4. Board (free / material / note tabs)
