# 학부 연구생 Vibe Coding 스터디 관리 사이트 PRD

## 0. 문서 목적
본 문서는 Claude Code 에이전트가 스터디 관리 웹사이트를 구현할 때 참조하는 확정 요구사항 명세서다.
모든 항목은 결정이 완료된 상태이며, 개발 중 애매한 부분이 있으면 임의로 판단하지 말고 본 문서를 그대로 따를 것.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 목적 | 학부 연구생 간 Claude Code 기반 vibe coding 스터디 관리 |
| 사용자 유형 | 관리자(스터디장) 1명, 스터디원 다수 |
| 핵심 가치 | 출결/성과의 투명한 공개, 진도 관리, 학습 자료·프로젝트 아카이빙 |
| 배포 목표 | 무료 티어 인프라로 운영 |

---

## 2. 기술 스택

- **프론트엔드**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **백엔드**: Next.js API Routes / Route Handler
- **인증**: Supabase Auth의 GitHub OAuth. 로그인 성공만으로는 서비스 이용 불가하며, **관리자 승인 후에만 접근 허용** (3번, 4.0번 항목)
- **DB**: Supabase PostgreSQL
- **실시간 동기화**: Supabase Realtime (출석 코드 송출, 출결 현황 갱신 — 4.1번 항목)
- **배포**: Vercel
- **파일 업로드**: Supabase Storage
- **AI 1차 채점**: Gemini API, `gemini-3.1-flash-lite` 모델 (4.2번 항목)

### 2.1 Supabase MCP를 통한 DB 구현 방식

DB 테이블/RLS 정책은 Supabase 대시보드에서 수동으로 만들지 않고, **Claude Code가 Supabase MCP 서버를 통해 SQL로 직접 구축**한다.

**설정 절차**
1. Supabase 프로젝트 생성 후 Personal Access Token 발급
2. Claude Code에 Supabase MCP 서버 등록 (`claude mcp add` 또는 `.mcp.json`)
3. MCP 연결 후 `list_tables`, `execute_sql`, `apply_migration` 등 MCP 툴로 스키마 적용

**작업 방식**
- 4번 항목의 테이블 정의를 기반으로 `CREATE TABLE` + 인덱스 + RLS 정책까지 SQL로 작성해 마이그레이션 형태로 적용
- 마이그레이션 파일은 `supabase/migrations/`에 순번을 붙여 저장 (예: `0001_create_users.sql`)하여 Git으로 이력 추적
- 스키마 변경 시에도 대시보드 직접 수정 없이 새 마이그레이션 파일 추가로 진행

**보안 관련 규칙**
- MCP Access Token은 절대 코드/Git에 커밋하지 않고 환경변수로 관리한다
- RLS 정책은 Claude가 SQL로 생성한 뒤 관리자가 한 번 더 검토한다 (3번/4.0번 권한 분리, 4.1번 출석 코드 노출 방지 요구사항 확인)

**프로젝트 구성: 개발/운영 분리**
- Supabase 프로젝트를 처음부터 2개 생성한다: `study-site-dev`(개발용), `study-site-prod`(운영용)
- Claude Code의 MCP는 `study-site-dev`에만 연결한다. 운영용 프로젝트에는 직접 접근하지 않는다
- `study-site-dev`에서 검증된 마이그레이션 SQL만 `study-site-prod`에 별도 절차로 적용한다
- 실제 서비스는 `study-site-prod`만 사용하며, Vercel 환경변수도 운영 단계에서는 `study-site-prod`를 가리킨다

---

## 3. 사용자 역할

### 관리자 (스터디장, 1명)
- 시험 문제 등록, 주차별 계획 등록/진도 체크, 출석 승인, 강의자료 업로드
- 시험 채점 최종 확정 권한 (4.2번 항목)
- 관리자 계정은 시스템 내 항상 1명만 존재한다

### 스터디원
- 본인 출석 체크, 시험 응시, GitHub/프로젝트 링크 등록, 게시판 글쓰기(자유게시판·필기노트)
- 타인의 점수/순위는 조회만 가능 (수정 불가)

### 승인 대기 (Pending)
- GitHub OAuth 로그인은 했지만 관리자 승인 전 상태
- 스터디원 기능에 전혀 접근 불가, "승인 대기 중입니다" 안내 화면만 노출
- 관리자가 승인해야 스터디원 역할로 전환됨

---

## 4. 기능 명세

### 4.0 회원가입 및 로그인 승인 (Approval Gate)
- GitHub OAuth로 로그인은 누구나 시도 가능하지만, 최초 로그인 시 계정 상태를 `pending`으로 생성
- `pending` 상태인 사용자는 어떤 페이지에 접근해도 "승인 대기 중" 안내만 보이고, 그 외 기능은 서버 단(API + RLS)에서 차단
- 관리자 전용 "가입 승인 관리" 페이지에서 대기 목록을 확인하고 승인/거절 처리
  - 승인 시 `approved`로 상태 변경 → 정상 이용 가능
  - 거절 시 `rejected`로 상태 변경, 관리자가 이후 재승인 가능
- 승인 여부 체크는 프론트엔드뿐 아니라 Supabase RLS 정책과 API 라우트 양쪽에서 검증한다 (프론트엔드 라우팅 가드만으로는 우회 가능)

**DB 테이블**
```
users(id, github_id, github_username, display_name, avatar_url,
      role ENUM('admin','member'),
      status ENUM('pending','approved','rejected'),
      approved_by, approved_at, created_at)
```

### 4.1 출석 체크 (실시간 코드 인증 방식)

**화면 구성**
- 출결 화면은 관리자/스터디원 공통으로 인원 로스터(이름 + GitHub 프로필 사진 + 출결 상태 뱃지)를 보여준다
- 기본 상태값은 결석이며, 이후 출석/지각으로 변경된다
- 로스터는 Supabase Realtime 구독을 통해 상태 변경 시 모든 접속자 화면에 즉시 반영된다

**동작 흐름**
1. 관리자가 출석 가능 시간을 **1~5분 사이, 1분 단위로 지정**하고 "출석 시작" 버튼 클릭 → `attendance_session` 생성: 랜덤 4자리 숫자 코드, `duration_minutes`(지정값), `opened_at = now`, `closes_at = opened_at + duration_minutes`, `is_active = true`
2. 관리자 화면에만 4자리 코드와 설정된 시간 기준의 카운트다운이 노출된다
3. 스터디원 화면에는 코드가 보이지 않고, 4자리 숫자 입력 인풋만 노출된다
4. 스터디원이 코드를 입력 → 서버(API Route)에서 검증
   - 세션이 `is_active`이고 `closes_at` 이전이며 입력값이 일치하면 `attendance_records.status`를 `출석`으로 변경, `checked_at` 기록
   - 이미 출석 처리된 사용자가 재입력 시 "이미 출석 처리되었습니다" 안내
5. 설정된 시간이 경과하면 세션은 자동으로 `is_active = false` 처리되며, 미입력자는 기본값인 결석으로 유지된다
6. 관리자는 세션 종료 후 개별 인원의 상태를 수동으로 지각 등으로 조정할 수 있다

**보안 규칙**
- 코드 값은 관리자 role의 클라이언트에만 응답하도록 API/RLS에서 분리한다
- 코드 검증은 서버(API Route)에서 수행한다
- `duration_minutes`는 1~5 범위를 벗어난 값이 들어오지 않도록 서버에서도 검증한다

**DB 테이블**
```
attendance_sessions(id, week_number, code, duration_minutes, opened_at, closes_at, is_active, created_by)
attendance_records(id, session_id, user_id, status ENUM('출석','지각','결석'),
                    checked_at)
```

### 4.2 온라인 시험 (전 주관식, 제한시간)
- 관리자가 문제(텍스트), 배점, 제한시간(분)을 입력해 시험 생성
- 스터디원이 응시 시작 시 서버에 시작 시각 기록, 제한시간 초과 시 자동 제출
- 남은 시간은 서버 기준으로 유지된다 (localStorage 의존 금지)

**채점 프로세스 (AI 1차 채점 + 이의제기)**

AI 1차 채점 → 사람 검증의 2단계 구조로 진행한다. AI 채점은 초안이며, 최종 채점 권한은 항상 관리자(스터디장)에게 있다.

1. 스터디원이 문제를 풀고 제출한다
2. 제출 즉시 서버가 Gemini API(`gemini-3.1-flash-lite` 모델)를 호출해 각 답안을 1차 채점한다 — 문항별 점수와 채점 근거(rationale)를 함께 생성해 저장
3. 스터디원은 본인의 채점 결과(AI 점수 + 근거)를 확인한다
4. 채점이 이상하다고 판단되면 해당 문항에 이의제기를 등록한다 → 다른 스터디원들이 댓글로 참여해 토론
5. 토론 내용을 참고해 관리자가 최종 채점 결과를 확정한다. 관리자는 오답을 정답으로, 정답을 오답으로 양방향 변경할 수 있다
6. 총점/출석률/랭킹 계산에는 AI 1차 점수가 아니라 관리자가 확정한 최종 점수만 반영된다

**Gemini API 연동 규칙**
- Gemini API Key는 Git에 커밋하지 않고 환경변수로 관리한다
- 채점 정확도를 위해 thinking level을 `medium` 이상으로 설정한다 (채점은 비동기 작업이므로 응답 속도보다 정확도 우선)
- 제출 직후 "채점 중" 상태를 보여주고 완료 시 결과를 갱신하는 비동기 처리로 구현한다
- AI가 채점 근거를 함께 생성하도록 프롬프트를 설계해 스터디원의 이의제기 판단에 활용한다

**DB 테이블**
```
exams(id, title, week_number, time_limit_minutes, created_by)
exam_questions(id, exam_id, question_text, max_score, order)
exam_submissions(id, exam_id, user_id, started_at, submitted_at)
exam_answers(id, submission_id, question_id, answer_text,
             ai_score, ai_rationale,
             final_score, resolved_by, resolved_at)
exam_disputes(id, answer_id, created_by, created_at)
exam_dispute_comments(id, dispute_id, user_id, content, created_at)
```

### 4.3 주차별 계획
- 별도 페이지 없이 **메인 페이지(4.7번)에 전체 표가 노출**된다
- 표 형태로 주차, 섹션, 강의 범위, 주제(제목) 표시
- 관리자는 메인 페이지에서 각 주차 항목을 체크박스로 완료/미완료 토글 → 진도율 자동 계산
- 스터디원 화면은 읽기 전용 + 진행 상태 시각 표시 (진행바 등)

**DB 테이블**
```
weekly_plans(id, week_number, section_number, lecture_range, title, is_completed)
```

**시드 데이터 (10주 커리큘럼)**

Claude Code with a Silicon Valley Engineer 강의 하나로 10주 전 회차를 진행한다.
"제목" 열은 공식 커리큘럼 원문이 아니라 각 강의 구간 내용을 바탕으로 요약한 타이틀이다.

| 주차 | 섹션 | 강의 범위 | 제목 |
|---|---|---|---|
| 1 | Section 1 | 1강 ~ 6강 | 사용자에서 설계자로 — Claude Code를 왜 지금 써야 하는가 |
| 2 | Section 2 | 7강 ~ 14강 | 핵심 엔진 정복 — Claude Code 기본기와 비용 전략 |
| 3 | Section 3 | 15강 ~ 17강 | 미니 프로젝트 — 실전 앱을 직접 만들어보기 |
| 4 | Section 4 | 18강 ~ 20강 | 자동화 레이어 (전반) — AI를 팀원으로 만들기 |
| 5 | Section 4 | 21강 ~ 24강 | 자동화 레이어 (후반) — AI를 팀원으로 만들기 |
| 6 | Section 5 | 25강 ~ 27강 | 오케스트레이터로의 전환 (1부) |
| 7 | Section 5 | 28강 ~ 32강 | 오케스트레이터로의 전환 (2부) |
| 8 | Section 5 | 33강 ~ 35강 | 오케스트레이터로의 전환 (3부) |
| 9 | Section 5 | 36강 | 오케스트레이터로의 전환 (4부) |
| 10 | Section 5 | 37강 ~ 39강 | 오케스트레이터로의 전환 (마무리) |

**resource_url**
- `https://www.inflearn.com/en/course/claude-code-with-sil?cid=340819`

### 4.4 마이페이지 (개인별 점수/출석률/랭킹/프로젝트)
- 별도의 "랭킹" 메뉴 없이, **마이페이지 하나에 개인 정보와 전체 랭킹을 함께 표시**한다
- 시험 점수 합산 + 출석률에 가중치를 부여해 총점 산출 (가중치는 관리자 설정 가능)
- 본인 점수 추이 그래프, 출석 이력
- 전체 랭킹표: 총점 기준 정렬, **실명으로 전체 공개** (익명화 기능 없음)
- GitHub 링크, 개인 프로젝트 링크(repo 또는 배포 URL) 등록/노출
- 필기 노트는 여기서 관리하지 않는다 (4.5번 게시판 참고)

### 4.5 게시판 (자유게시판 / 강의자료 / 필기노트)
- 하나의 게시판 메뉴 안에 3개 탭으로 구성한다
  - **자유게시판**: 개발 뉴스 등 자유 주제. 누구나 작성/조회/댓글/삭제(본인 글만) 가능
  - **강의자료**: 관리자가 업로드한 자료(PDF, 링크, 슬라이드) 목록. 관리자만 작성 가능, 주차별 계획과 연동해 해당 주차 자료를 연결
  - **필기노트**: 스터디원 각자의 필기 노트. 마크다운 에디터로 직접 작성하며 웹에서 바로 렌더링. 작성자 본인만 수정/삭제 가능
- 파일 첨부가 필요한 경우(강의자료의 PDF 등) Supabase Storage에 저장한다

**DB 테이블**
```
board_posts(id, category ENUM('free','material','note'), author_id, title,
            content_markdown, link_url, week_number, created_at, updated_at)
board_comments(id, post_id, author_id, content, created_at)
```

### 4.6 관리자 메뉴
- 관리자에게만 노출되는 별도 메뉴
- 가입 승인 관리 (4.0번 항목)

### 4.7 메인 페이지 (대시보드)
- 로그인 후 첫 화면
- 통계 대시보드를 노출한다: 주차별 평균 점수 추이 그래프, 주차별 출석률 추이 그래프, 본인 점수/출석률을 전체 평균과 비교하는 위젯
- 주차별 계획 전체 표와 진행 현황(4.3번)을 함께 표시한다 (관리자는 여기서 진도 체크 가능)
- 출석 상태는 메인 페이지에 표시하지 않는다 (출석은 2번 메뉴에서 별도 확인)

---

## 5. 페이지 구성 및 내비게이션

내비게이션 바 순서와 각 메뉴의 하위 구성은 다음과 같다.

| 순서 | 메뉴 | 하위 구성 |
|---|---|---|
| 1 | 메인 | 통계 대시보드, 주차별 계획 전체 표/진행 현황 (4.7번) |
| 2 | 출석 | 출석 체크 화면 · 로스터 (관리자: 시작 버튼 + 시간 설정) (4.1번) |
| 3 | 시험 | 시험 목록 · 응시 화면 · 채점 결과/이의제기 토론 (관리자: 시험 생성) (4.2번) |
| 4 | 마이페이지 | GitHub/프로젝트 링크, 개인 점수·출석 통계, 전체 랭킹표 (4.4번) |
| 5 | 게시판 | 자유게시판 / 강의자료 / 필기노트 탭 (4.5번) |
| 6 | 관리자 메뉴 (관리자에게만 노출) | 가입 승인 관리 (4.6번) |

---

## 6. DB: Supabase

관계형 데이터(사용자-출결-시험-점수-게시판 연관관계)에 적합한 PostgreSQL 기반이며, Auth·Storage·Realtime을 하나의 서비스로 해결해 별도 서버 관리 없이 무료 티어로 운영 가능하다는 이유로 Supabase를 사용한다.

- DB 500MB, Storage 1GB, 월간 활성 사용자 50,000명 (무료 티어 기준, 스터디 규모에 충분)
- Row Level Security로 권한 제어를 DB 레벨에서 강제
- `@supabase/ssr` 공식 라이브러리로 Next.js와 통합

---

## 7. 비기능 요구사항

- 서버 시간 기준으로 모든 시간 제약(출석 마감, 시험 제한시간)을 처리한다 (클라이언트 조작 방지)
- 관리자 권한과 일반 사용자 권한을 DB 레벨(RLS)에서도 분리한다 (프론트엔드 조건문만으로 권한을 막지 않음)
- 반응형 디자인 필수 (모바일에서 출석 체크 가능해야 함)
- 초기 사용자 수가 적으므로(학부 연구생 규모) 과도한 확장성 설계보다 빠른 완성에 집중한다

---

## 8. 구현 순서

1. **Phase 1**: 인증(GitHub OAuth + 관리자 승인 플로우) + 출석 체크
2. **Phase 2**: 온라인 시험(AI 1차 채점 + 이의제기 프로세스 포함) + 마이페이지(점수/출석률/랭킹/프로젝트)
3. **Phase 3**: 메인 페이지(통계 대시보드 + 주차별 계획 표/진행 현황)
4. **Phase 4**: 게시판(자유게시판 / 강의자료 / 필기노트)

---

## 9. Claude Code 작업 규칙

- 본 문서를 `@docs/PRD.md` 형태로 참조하며 Phase 단위로 구현하고 커밋을 분리한다
- DB 스키마는 4번 항목의 테이블 정의를 기반으로 하되, 세부 컬럼(created_at, updated_at 등)은 자유롭게 보완한다
- DB 생성/변경은 Supabase 대시보드에서 수동으로 하지 않고 2.1번 항목대로 Supabase MCP를 통해 SQL 마이그레이션으로 적용한다
- UI 라이브러리는 shadcn/ui + Tailwind를 사용하며, 다른 라이브러리로 임의 교체하지 않는다