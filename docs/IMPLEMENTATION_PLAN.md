# 구현 계획 (Implementation Plan)

`@docs/PRD.md`(요구사항)와 `@CLAUDE.md`(기술/디자인 규칙) 기반의 구현 체크리스트. 위에서 아래로, Phase 순서대로 진행한다.

## 사용 규칙
- 각 task 완료 시 `[ ]` → `[x]` 로 체크한다.
- **`[직접]`** 표시 = 사용자가 직접 해야 하는 작업 (계정/키 발급, 대시보드 설정 등). 나머지는 AI 에이전트가 수행.
- DB 변경은 `supabase-migrator` 서브에이전트가 번호순 마이그레이션으로 dev에만 적용. UI는 `ui-design-implementer`. 각 Phase 끝에 `rls-security-auditor` + `server-logic-tester`로 검수.
- Phase 단위로 커밋을 분리한다 (PRD §9). 키/토큰은 절대 커밋하지 않는다.

---

## Phase 0 — 기반 세팅 (Foundation)

### 0.1 외부 계정·키 (선행 필수)
- [x] **[직접]** Supabase 프로젝트 2개 생성: `study-site-dev`, `study-site-prod`
- [x] **[직접]** Supabase Personal Access Token 발급 (MCP 연결용)
- [x] **[직접]** dev 프로젝트의 `Project URL` / `anon key` / `service_role key` 확보해 전달
- [x] **[직접]** GitHub OAuth App 생성 (dev용). Authorization callback URL = `https://<dev-ref>.supabase.co/auth/v1/callback`. `Client ID`/`Client Secret` 확보
- [x] **[직접]** Supabase dev 대시보드 → Authentication → Providers → GitHub 활성화 + Client ID/Secret 입력, Site URL/Redirect URL(`http://localhost:3000/**`) 설정
- [x] **[직접]** Gemini API Key 발급
- [x] **[직접]** Supabase MCP 서버를 Claude Code에 등록 (dev 프로젝트, PAT 사용) — `study-site-dev`에만 연결, prod 미연결 확인 *(검증 완료 2026-07-04: `get_project_url` = `ibeicbdshogrnhaxmuse`(dev), 테이블/마이그레이션 0개)*

### 0.2 프로젝트 스캐폴딩
- [x] `create-next-app` (App Router + TypeScript + Tailwind, `src/` 구조) — Next.js 16.2.10
- [x] shadcn/ui `init` (CSS 변수 모드) — radix base, nova preset
- [x] 기본 shadcn 컴포넌트 추가: button, card, table, input, textarea, form(→`field`로 대체됨), dialog, dropdown-menu, tabs, badge, avatar, sheet, progress, sonner(toast), skeleton (+ empty, spinner, label, separator)
- [x] `@supabase/ssr` + `@supabase/supabase-js` 설치
- [x] Supabase 클라이언트 유틸 3종: browser client / server client / **proxy** client (`src/lib/supabase/{client,server,proxy}.ts` + `src/proxy.ts` — Next 16은 middleware.ts 대신 proxy.ts)
- [x] `.env.example` 작성 (URL, anon, service_role, GitHub, Gemini 키 항목) → **[직접]** `.env.local`에 실제 값 입력 *(URL+publishable key는 MCP로 채워둠; `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`만 직접 입력 필요)*

### 0.3 디자인 시스템 → 코드 (CLAUDE.md 헌법 반영)
- [x] `next/font`: Hanken Grotesk(display) + Inter(body) + JetBrains Mono
- [x] `globals.css`에 팔레트 CSS 변수 매핑 (Tailwind v4 `@theme inline`, hex): 바이올렛 primary `#7365A6`, 플럼 잉크 `#29273A`, 뮤트 `#55566B`, border `#E6E4EC`, 밴드(peach/lavender/pink), 상태색(sage/terracotta/slate), 차트 액센트 6종, `--radius:0.5rem`
- [x] Tailwind 테마 연결 + 다크모드 토큰(선택, light 우선) — `.dark` 웜 바이올렛 팔레트 포함
- [x] 앱 셸 레이아웃: 전역 네비게이션 (`src/components/layout/site-nav.tsx` + 공유 `Container`)
  - fixed, 최상단 투명 → 스크롤 시 흰색+하단 border (JS 스크롤 리스너 `.scrolled`)
  - 로고 `Study` 워드마크(아이콘 없음), 좌측 = 콘텐츠 거터 정렬(공유 컨테이너) — 브라우저에서 정렬 검증됨
  - 링크+버튼 우측 그룹, 순서 **메인·출석·시험·게시판·마이페이지** (관리자 메뉴는 현재 항상 노출 — Phase 1에서 admin 게이팅)
  - `max-width:1200px` 컨테이너, 모바일 sheet(햄버거, Radix icons)
- [x] 공통 컴포넌트: 상태 뱃지(출석/지각/결석), 빈 상태(내부 도구톤, 광고성 문구 없음), 페이지 헤더(eyebrow+제목) — `src/components/common/`
- [x] *(추가)* 임시 랜딩 히어로(peach 밴드 + UbSE 워터마크) — Phase 3 대시보드로 교체 예정. Button `default`/`outline` variant를 헌법 인터랙션 스펙으로 조정

---

## Phase 1 — 인증 + 출석 (PRD §4.0, §4.1)

### 1A. 회원가입 / 로그인 승인 게이트 (§4.0)
- [ ] `0001_create_users.sql`: `users(role enum admin|member, status enum pending|approved|rejected, github_id/username, display_name, avatar_url, approved_by, approved_at, created_at)` + 인덱스
- [ ] users RLS: 본인 행 조회 / admin 전체 조회·수정 / status·role은 admin만 변경 / single-admin 보장(admin 1명 초과 방지)
- [ ] GitHub OAuth 로그인·로그아웃·콜백 라우트 (Supabase Auth)
- [ ] 최초 로그인 시 `users` 행 자동 생성(`status=pending`) — DB 트리거 또는 콜백 서버 로직
- [ ] 승인 대기 화면(`pending`/`rejected` 안내) — 그 외 기능 접근 불가
- [ ] 3계층 접근 차단: 미들웨어(라우팅 가드) + API 라우트 검증 + RLS 모두에서 pending/rejected 차단
- [ ] **[직접]** 본인 GitHub username 제공 → (AI) MCP로 해당 계정 `role=admin, status=approved` 승격 (최초 관리자 지정)
- [ ] 관리자 "가입 승인 관리" 페이지: 대기 목록 + 승인/거절 (admin 전용 API + RLS)

### 1B. 출석 (실시간 코드 인증, §4.1)
- [ ] `0002_create_attendance.sql`: `attendance_sessions(week_number, code, duration_minutes, opened_at, closes_at, is_active, created_by)`, `attendance_records(session_id, user_id, status enum 출석|지각|결석, checked_at)` + 인덱스
- [ ] attendance RLS: **`code`는 admin 클라이언트만 select 가능**, `duration_minutes` CHECK(1–5), 본인 record만 갱신 불가(검증은 서버), admin 전체 관리
- [ ] Realtime 활성화(publication)로 로스터 상태 변경 브로드캐스트
- [ ] 세션 시작 API (admin): 랜덤 4자리 코드 생성, `duration_minutes` 1–5 서버 검증, `closes_at = opened_at + duration`, `is_active=true`
- [ ] 코드 검증 API (member): `is_active` && `now < closes_at` && 코드 일치 → `출석` + `checked_at`; 이미 출석 시 "이미 출석 처리되었습니다"
- [ ] 세션 자동 종료: `closes_at` 경과 시 `is_active=false`, 미입력자 `결석` 유지 (서버 시간 기준)
- [ ] admin 수동 상태 조정 API (지각 등)
- [ ] 출석 페이지 로스터: 이름 + 아바타 + 상태 뱃지(기본 결석), Realtime 구독 반영
- [ ] admin 화면: 시간 설정(1–5) + 시작 버튼 + **코드/카운트다운 표시**
- [ ] member 화면: 4자리 입력 인풋만(코드 비노출), 모바일 thumb-friendly

### 1 검수
- [ ] `rls-security-auditor`: 승인 게이트 우회, 코드 노출, single-admin, 서버시간
- [ ] `server-logic-tester`: 코드 검증/`duration` 범위/자동 종료/재입력/승인 상태 전이
- [ ] `ui-design-implementer`: 네비·로스터·입력 화면 디자인 대조 + 브라우저 렌더 검증

---

## Phase 2 — 온라인 시험 + 마이페이지 (PRD §4.2, §4.4)

### 2A. 시험 · AI 채점 · 이의제기 (§4.2)
- [ ] **[직접]** Gemini API Key `.env.local` 입력 (미입력 시 채점 불가)
- [ ] `0003_create_exams.sql`: `exams`, `exam_questions(max_score, order)`, `exam_submissions(started_at, submitted_at)`, `exam_answers(answer_text, ai_score, ai_rationale, final_score, resolved_by, resolved_at)`, `exam_disputes`, `exam_dispute_comments` + 인덱스
- [ ] exams RLS: 시험 생성/최종채점 admin 전용, 본인 submission·answer만 조회/작성, `final_score`·`resolved_by`는 admin만 기록, 이의제기·댓글은 승인 사용자
- [ ] 시험 생성 API (admin): 문제(텍스트)·배점·제한시간(분)
- [ ] 응시 시작 API: `started_at` 서버 기록
- [ ] 남은 시간 = 서버 `started_at`+제한시간 기준 계산 (localStorage 금지)
- [ ] 제출 API + 제한시간 초과 시 자동 제출
- [ ] Gemini 1차 채점(비동기): `gemini-3.1-flash-lite`, thinking `medium`+, 문항별 점수+근거(rationale) 저장, 제출 직후 "채점 중" → 완료 시 갱신
- [ ] 이의제기 등록 API + 댓글 API (토론)
- [ ] 관리자 최종 확정 API: 정답↔오답 양방향 변경, `final_score`/`resolved_by`/`resolved_at`
- [ ] 시험 목록 / 응시 화면(서버 타이머) / 결과 화면(AI 점수+근거)
- [ ] 이의제기 + 댓글 토론 UI, admin 시험 생성 + 최종 채점 UI

### 2B. 마이페이지 + 랭킹 (§4.4)
- [ ] `0004_create_scoring.sql`: 총점 가중치 설정 저장(예: `app_settings` key-value 또는 `scoring_config`), 사용자 프로필 링크 컬럼(github_url, project_url) — users 확장 또는 별도 테이블 + RLS
- [ ] 총점 계산: **admin 확정 최종 점수 합** + 출석률 × 가중치(admin 설정 가능). AI 1차 점수는 미반영
- [ ] 랭킹 API: 총점 정렬, **실명 전체 공개**(익명화 없음)
- [ ] 마이페이지: 본인 점수 추이 그래프, 출석 이력
- [ ] 전체 랭킹표(실명·총점), GitHub/프로젝트 링크 등록·노출 (본인만 수정)
- [ ] admin 가중치 설정 UI

### 2 검수
- [ ] `rls-security-auditor`: 타인 답안/점수 조작, `final_score` 쓰기 권한, 랭킹은 최종점수만, 제한시간 서버검증
- [ ] `server-logic-tester`: 제한시간/자동제출/최종점수만 총점 반영/가중치 계산
- [ ] `ui-design-implementer`: 응시·결과·랭킹·차트(팔레트 순서) 검증

---

## Phase 3 — 메인 대시보드 + 주차별 계획 (PRD §4.3, §4.7)
- [ ] `0005_create_weekly_plans.sql`: `weekly_plans(week_number, section_number, lecture_range, title, is_completed)` + RLS(admin 토글, member 읽기)
- [ ] 시드: 10주 커리큘럼 데이터 + `resource_url`(인프런 강의 링크)
- [ ] 주차 완료 토글 API (admin) → 진도율 자동 계산
- [ ] 통계 집계: 주차별 평균 점수 추이 / 주차별 출석률 추이 / 본인 vs 전체 평균
- [ ] 메인 대시보드: 통계 그래프 3종 + 본인 비교 위젯 (**출결 현황은 메인에 표시하지 않음**)
- [ ] 주차별 계획 표 + 진행바: admin 체크박스 토글, member 읽기 전용
- [ ] 검수: `ui-design-implementer`(차트/표), `rls-security-auditor`(토글 admin 전용)

---

## Phase 4 — 게시판 (PRD §4.5)
- [ ] `0006_create_board.sql`: `board_posts(category enum free|material|note, author_id, title, content_markdown, link_url, week_number, created_at, updated_at)`, `board_comments` + RLS
- [ ] board RLS: 자유게시판 누구나(승인) 작성/댓글, 본인 글만 수정·삭제, **강의자료는 admin만 작성**, 필기노트는 본인만 수정·삭제
- [ ] Supabase Storage 버킷(강의자료 PDF 등) 생성 + 접근 정책
- [ ] 게시판 1메뉴 3탭 UI
- [ ] 자유게시판: 작성/조회/댓글/삭제(본인)
- [ ] 강의자료: admin 업로드(파일/링크), 주차별 계획 연동
- [ ] 필기노트: 마크다운 에디터 작성 + 웹 렌더, 본인만 수정·삭제
- [ ] 검수: `rls-security-auditor`(본인 글/강의자료 admin/Storage 정책), `ui-design-implementer`

---

## Phase 5 — 배포 & 운영 (Deploy)
- [ ] 전체 반응형/접근성 최종 점검 (모바일 출석 포함)
- [ ] `rls-security-auditor` 전체 최종 감사 (모든 테이블 RLS + API)
- [ ] **[직접]** prod GitHub OAuth App 생성 + Supabase prod GitHub provider 설정 (prod callback URL)
- [ ] **[직접]** 검증된 dev 마이그레이션을 `study-site-prod`에 적용 (dev→prod 승격 절차, 대시보드/CLI 수동)
- [ ] **[직접]** Vercel 프로젝트 생성 + 저장소 연결 + 환경변수(prod URL/키/Gemini) 입력
- [ ] **[직접]** prod 최초 로그인 후 본인 계정을 admin 승격 (single-admin)
- [ ] 배포 후 스모크 테스트 (로그인→승인→출석→시험→랭킹→게시판 e2e 흐름)
