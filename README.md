# Cowork26

Next.js, Supabase, Tiptap 기반의 workspace 문서 편집 앱입니다. Workspace별 중첩 page, 역할 기반 접근 제어, 자동 저장, 검색, Markdown 변환, 표 편집, 이미지 첨부와 반응형 모바일 UI를 제공합니다.

현재는 서버 저장 기반 협업 모델입니다. Yjs와 Hocuspocus 패키지는 설치되어 있지만 실시간 동시 편집에는 연결하지 않았습니다.

## 주요 기능

### 인증과 workspace

- Supabase 이메일 회원가입·로그인 및 이메일 인증
- `owner`, `editor`, `viewer` 역할 기반 접근 제어
- workspace 생성·이름 변경·사용자별 표시 순서 변경
- 가입된 사용자를 이메일로 멤버 추가
- 짧은 workspace/page URL 및 브라우저 뒤로·앞으로 이동 지원

### Page와 편집기

- `parent_id` 기반 중첩 page 트리
- page 생성·삭제·드래그 순서 변경·계층 이동
- 같은 workspace의 page만 부모로 지정 가능하며 자기참조와 cycle 차단
- 제목 blur 저장 및 본문 1.5초 debounce 자동 저장
- page 검색 및 Markdown 다운로드
- 페이지 행 우클릭·`⋯` 공통 메뉴와 모바일 bottom sheet
- `/table`·`/표` 명령을 통한 2×2, 3×3, 4×4 표 생성
- 표 행·열 추가/삭제, header 전환, 셀 병합·분할, 표 삭제
- 표 열 너비·행 높이 조절과 문서 폭 내부 가로 스크롤
- 선택 텍스트의 3단계 글자 크기 조절 (`13px`, 기본, `20px`)
- 코드 블록 syntax highlighting
- Markdown 표·목록·제목·인라인 문법 붙여넣기 변환
- Mermaid 코드 블록 렌더링 및 소스 편집

### 모바일 UI

- 모바일 헤더에서 페이지 탐색에 접근하고, 검색은 sidebar의 Pages 영역에서 실행
- 페이지 목록을 backdrop·Escape로 닫을 수 있는 sidebar drawer로 표시
- 페이지 작업 메뉴는 bottom sheet, 설정은 전체 높이 우측 drawer로 표시
- 주요 모바일 버튼에 44×44px 터치 영역 적용
- 넓은 표는 문서나 sidebar를 밀어내지 않고 표 내부에서만 가로 스크롤

### 이미지

- PNG, JPEG, WebP, GIF 첨부
- API가 발급한 Supabase Signed Upload URL로 브라우저에서 직접 업로드
- 업로드 전 page 편집 권한, 완료 후 실제 MIME·크기 재검증
- 전체 API 상한 20MB
- 5MB 초과 PNG/JPEG/WebP는 최대 2560px WebP로 최적화
- 애니메이션 GIF는 변환하지 않으며 5MB 이하만 허용
- 앱 내부 이미지 복사 시 대상 page 전용 asset으로 복제

## 요구 사항

- Node.js 20.9 이상
- npm
- Supabase 프로젝트
- 배포 시 Vercel 또는 Next.js를 실행할 수 있는 Node.js 환경

## 로컬 실행

```bash
npm ci
cp .env.example .env.local
npm run dev
```

기본 개발 주소는 `http://localhost:3000`입니다.

## 환경 변수

`.env.local`에 다음 값을 설정합니다.

```env
# 브라우저 공개 설정
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# 서버 전용 설정
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

# Legacy AGI — local development에서만 선택적으로 사용
NEXT_PUBLIC_ENABLE_AGI=false
ENABLE_LEGACY_AGI=false
JJAPVIS_SERVER_URL=
NEXT_PUBLIC_JJAPVIS_SERVER_URL=
AGI_CLIENT_SHA256=
```

### 환경변수 주의사항

- `SUPABASE_SERVICE_KEY`는 서버 전용 secret입니다. `NEXT_PUBLIC_` 접두어를 붙이거나 브라우저 코드에서 참조하지 않습니다.
- `SUPABASE_KEY` fallback은 지원하지 않습니다. 배포 환경에도 정확히 `SUPABASE_SERVICE_KEY`를 설정해야 합니다.
- `NEXT_PUBLIC_SITE_URL`은 실제 접속 origin과 일치시킵니다. Supabase Authentication의 Redirect URLs에도 같은 주소를 등록합니다.
- Production과 Preview는 가능하면 서로 다른 Supabase 프로젝트와 service key를 사용합니다.
- `.env*` 파일은 `.env.example`을 제외하고 Git에서 무시됩니다.

워크스페이스 AI 기능의 Supabase SQL 적용과 Vercel secret/feature flag 설정은 코드 구현과 분리해서 진행합니다. `006`과 `007` migration은 작성·검증됐고 `008` AI schema는 아직 구현 전입니다. 환경별 적용 여부와 다음 수동 작업은 [워크스페이스 AI 수동 설정 가이드](./docs/WORKSPACE_AI_MANUAL_SETUP_GUIDE.md)를 따릅니다.

## Supabase 설정

Supabase SQL Editor 또는 프로젝트의 migration workflow에서 아래 파일을 순서대로 적용합니다.

```text
supabase/migrations/001_init.sql
supabase/migrations/002_notion_lite.sql
supabase/migrations/003_workspace_member_order.sql
supabase/migrations/004_workspace_members_hardening.sql
supabase/migrations/005_pages_tree_integrity.sql
supabase/migrations/006_page_assets_baseline.sql
supabase/migrations/007_page_content_revision.sql
supabase/migrations/008_ai_document_editing.sql
```

| Migration | 역할 |
|---|---|
| `001_init.sql` | 초기 profile·sheet PoC schema와 RLS |
| `002_notion_lite.sql` | workspace, membership, page schema와 RLS |
| `003_workspace_member_order.sql` | 사용자별 workspace 정렬 순서 |
| `004_workspace_members_hardening.sql` | 브라우저 직접 membership 변경과 self-owner 권한 상승 차단 |
| `005_pages_tree_integrity.sql` | cross-workspace parent와 page hierarchy cycle 차단 |
| `006_page_assets_baseline.sql` | 이미지 metadata·Storage bucket baseline과 브라우저 직접 CRUD 차단 |
| `007_page_content_revision.sql` | title/content revision과 stale 자동 저장 충돌 방지 |
| `008_ai_document_editing.sql` | 개인 AI credential 암호문, workspace opt-in 정책, 분석 요청·출처 metadata |

보안 migration 적용 안내:

- [Migration 004 runbook](./docs/SUPABASE_MIGRATION_004_RUNBOOK.md)
- [Migration 005 runbook](./docs/SUPABASE_MIGRATION_005_RUNBOOK.md)
- [Migration 006 runbook](./docs/SUPABASE_MIGRATION_006_RUNBOOK.md)
- [Migration 007 runbook](./docs/SUPABASE_MIGRATION_007_RUNBOOK.md)
- [Migration 008 runbook](./docs/SUPABASE_MIGRATION_008_RUNBOOK.md)

`workspace_members` 쓰기는 server API의 service-role client를 통해 처리합니다. 일반 사용자는 앱에서 멤버를 추가하지만, publishable key로 table을 직접 INSERT/UPDATE/DELETE할 수는 없습니다.

### 이미지 Storage

이미지 기능에는 Supabase Storage bucket과 `page_assets` metadata table이 필요합니다.

- Bucket: `page_assets`
- 최대 파일 크기: 20MB
- 허용 MIME: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- 현재 구현은 public URL을 문서에 저장

`page_assets` table과 bucket 계약은 `006_page_assets_baseline.sql`에 정식 migration으로 관리됩니다. 현재 호환성을 위해 public bucket을 사용하므로 URL을 아는 사용자는 이미지를 조회할 수 있습니다. private bucket 전환은 별도 migration과 signed read URL 설계가 필요합니다.

## 권한 모델

| 기능 | owner | editor | viewer |
|---|:---:|:---:|:---:|
| Workspace 조회 | ✓ | ✓ | ✓ |
| Workspace 이름 변경 | ✓ |  |  |
| 멤버 목록 조회 | ✓ | ✓ | ✓ |
| 멤버 추가·역할 upsert | ✓ |  |  |
| Page 조회 | ✓ | ✓ | ✓ |
| Page 생성·편집·이동·삭제 | ✓ | ✓ |  |
| 문서 편집·이미지 첨부 | ✓ | ✓ |  |

현재 멤버 추가는 초대 메일 방식이 아닙니다. 이미 가입한 사용자의 이메일을 찾아 membership을 생성합니다. 같은 이메일을 다시 추가하면 `editor`/`viewer` 역할이 갱신되며, 멤버 제거 UI/API는 아직 없습니다.

## 보안 경계

- 브라우저 요청의 Supabase access token을 서버에서 다시 검증합니다.
- 모든 workspace/page mutation은 서버에서 membership과 역할을 재확인합니다.
- Service-role client는 `server-only` 모듈로 브라우저 bundle 유입을 차단합니다.
- Page parent는 API와 DB trigger에서 같은 workspace·비순환 조건을 모두 검사합니다.
- 이미지 업로드는 고정 bucket·UUID 경로·MIME allowlist·크기 제한을 사용합니다.
- Legacy AGI는 production에서 비활성화됩니다.

### Legacy AGI

Legacy AGI는 local development 전용 선택 기능입니다. 다음 조건을 모두 만족해야 활성화됩니다.

- `NODE_ENV=development`
- `NEXT_PUBLIC_ENABLE_AGI=true`
- `ENABLE_LEGACY_AGI=true`
- 서버와 브라우저 URL이 모두 HTTPS
- `AGI_CLIENT_SHA256`가 64자리 SHA-256 hex

Production과 Preview에서는 관련 환경변수를 설정하지 않거나 false로 유지합니다.

## API

모든 일반 API는 `Authorization: Bearer <Supabase access token>` 헤더를 사용합니다.

```text
GET    /api/workspaces
POST   /api/workspaces
PATCH  /api/workspaces

GET    /api/workspaces/:id/members
POST   /api/workspaces/:id/members

GET    /api/pages?workspaceId=...
GET    /api/pages?id=...
POST   /api/pages
PATCH  /api/pages
DELETE /api/pages?id=...

POST   /api/assets              # action=prepare | complete
DELETE /api/assets              # 미등록 업로드 취소·정리
POST   /api/assets/clone

GET    /api/agi                 # local legacy AGI download
POST   /api/agi                 # local legacy AGI start/stop beacon
DELETE /api/agi                 # local legacy AGI stop
```

## 검증

변경 후 최소 검증 명령은 다음과 같습니다.

```bash
npm ci --dry-run --ignore-scripts
npm run typecheck
npm run test:image-assets
npm run test:editor-paste-priority
npm run test:page-parent-validation
npm run build
npm audit --omit=dev
git diff --check
```

현재 테스트 범위:

- Signed Upload 경로·MIME·크기·완료 검증
- 에디터 붙여넣기 처리 우선순위
- Page parent의 정상 이동·자기참조·cycle·cross-workspace 거부

`npm audit`은 공개 advisory가 갱신될 수 있으므로 배포 직전에 다시 실행합니다.

## 배포 체크리스트

- [ ] `004_workspace_members_hardening.sql` 적용 후 policy/grant 확인
- [ ] `005_pages_tree_integrity.sql` 적용 후 `pages_tree_integrity` trigger 확인
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` 설정
- [ ] 공개 Supabase 변수와 `NEXT_PUBLIC_SITE_URL` 설정
- [ ] Supabase Auth Redirect URLs 설정
- [ ] `NEXT_PUBLIC_ENABLE_AGI=false`, `ENABLE_LEGACY_AGI=false` 확인
- [ ] 테스트·production build·production dependency audit 실행
- [ ] Preview에서 로그인, workspace 생성, 멤버 추가, page CRUD, 이미지 업로드 smoke test

## 프로젝트 구조

```text
app/
  api/
    _utils/                     # 인증·API timing
    agi/                        # local-only legacy AGI
    assets/                     # 이미지 prepare/complete/delete/clone
    pages/                      # page CRUD와 hierarchy 검증
    workspaces/                 # workspace와 member API
  p/[pageId]/                   # 짧은 page URL
  w/[workspaceId]/              # workspace URL

components/
  notion-lite-app.tsx           # 앱 조립과 상위 상태 연결
  document-editor.tsx           # Tiptap editor
  notion-lite/                  # header/sidebar/tree/settings/document UI

hooks/
  use-workspace-data.ts         # workspace와 member 상태
  use-page-data.ts              # page 목록·cache·CRUD
  use-page-persistence.ts       # title/content 저장
  use-selection-navigation.ts   # URL과 선택 상태

lib/
  notion-lite/                  # API client, types, tree/move/role 로직
  supabase-admin.ts             # server-only service-role client
  supabase-browser.ts           # browser publishable client
  image-assets.ts               # 이미지 보안 규칙

supabase/migrations/            # 순서대로 적용하는 SQL migration
tests/                          # Node 기반 회귀·보안 테스트
docs/plans/                     # 구현 계획
docs/history/                   # 날짜별 개발 기록
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| Framework | Next.js 16, React 19, TypeScript 6 |
| UI | Tailwind CSS 4 |
| Editor | Tiptap 3, lowlight, Mermaid |
| Backend | Supabase Auth, Postgres, Storage |
| 배포 | Vercel 또는 Node.js Next.js runtime |

## 현재 제약과 후속 작업

- 실시간 공동 편집은 아니며, revision 기반 저장 충돌 감지 후 사용자가 내용을 직접 조정해야 합니다.
- Yjs/Hocuspocus 실시간 collaboration은 아직 연결하지 않았습니다.
- `page_assets`는 정식 baseline migration으로 관리하지만 현재 bucket은 호환성을 위해 public URL을 사용합니다.
- 멤버 제거·owner 이전·초대 메일 기능이 없습니다.
- API 공통 rate limit과 request body 상한이 아직 없습니다.
- 제목·이름·검색어·문서 JSON의 입력 크기 제한은 계획 단계이며 아직 적용되지 않았습니다.
- Markdown export는 이미지 파일을 함께 묶지 않고 URL을 참조합니다.

우선순위와 보안 개선 계획은 [PLAN_20260925_SECURITY_REMEDIATION_PRIORITIES.md](./docs/plans/PLAN_20260925_SECURITY_REMEDIATION_PRIORITIES.md)를 참고합니다.

최근 UI 및 입력 제한 계획:

- [모바일 UI 개선 계획](./docs/plans/PLAN_20260925_MOBILE_UI.md)
- [노션형 편집 인터랙션 및 표 UI 계획](./docs/plans/PLAN_20260926_NOTION_EDITOR_INTERACTIONS.md)
- [사용자 입력 및 요청 크기 제한 계획](./docs/plans/PLAN_20260926_INPUT_LIMITS.md)
- [사용자 API key 기반 워크스페이스 분석 계획](./docs/plans/PLAN_20260926_WORKSPACE_AI_ANALYSIS_BYOK.md)
- [워크스페이스 AI 분석 구체 구현 계획](./docs/plans/PLAN_20260926_WORKSPACE_AI_ANALYSIS_IMPLEMENTATION.md)
- [AI 프롬프트·Provider 아키텍처 계획](./docs/plans/PLAN_20260927_AI_PROMPT_PROVIDER_ARCHITECTURE.md)
- [2026-09-26 개발 기록](./docs/history/DEV_260926.md)

## 문서 관리

- 구현 계획: `docs/plans/PLAN_YYYYMMDD_*.md`
- 개발 기록: `docs/history/DEV_YYMMDD.md`
- 에디터 문법: [EDITOR_SYNTAX.md](./docs/EDITOR_SYNTAX.md)
