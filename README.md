# Cowork26

Next.js + Supabase + Tiptap 기반 Notion-lite 협업 문서 앱.

워크스페이스 단위로 페이지를 만들고 멤버를 초대해 함께 편집합니다. 실시간 동시 편집은 미연결이며, 페이지 전환 시 최신 내용을 자동으로 불러옵니다.

---

## 시작하기

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
# → http://localhost:3000

# 타입 검사
npm run typecheck

# 프로덕션 빌드
npm run build
```

---

## 환경 변수

`.env.local` 파일을 생성하고 아래 값을 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

NEXT_PUBLIC_ENABLE_AGI=false
JJAPVIS_SERVER_URL=...
NEXT_PUBLIC_JJAPVIS_SERVER_URL=...
```

배포 환경에서는 `NEXT_PUBLIC_SITE_URL`을 실제 도메인으로 변경합니다.
Supabase Authentication → Redirect URLs에도 해당 도메인을 등록해야 합니다.
현재 dev 환경 기본값: `https://cowork26dev.vercel.app`

`NEXT_PUBLIC_ENABLE_AGI`가 `true`일 때만 플로팅 AGI 버튼을 렌더링합니다. Vercel 배포 환경에서는 Windows EXE 실행이 불가능하고 HTTP iframe이 차단될 수 있으므로 기본값은 `false`로 둡니다.

---

## Supabase 세팅

Supabase Dashboard → SQL Editor에서 마이그레이션을 순서대로 실행합니다.

```
supabase/migrations/001_init.sql
supabase/migrations/002_notion_lite.sql
supabase/migrations/003_workspace_member_order.sql
```

핵심 테이블: `workspaces` · `workspace_members` · `pages`  
권한 검증은 API route에서 service role 클라이언트로 처리합니다.

`003_workspace_member_order.sql`은 `workspace_members.order_index`를 추가합니다. 이 값은 사용자별 워크스페이스 목록 정렬 순서를 저장합니다.

---

## 기술 스택

| 분류 | 패키지 |
|------|--------|
| 프레임워크 | Next.js 16, React 19, TypeScript |
| 스타일 | Tailwind CSS |
| 에디터 | Tiptap, @tiptap/extension-table, @tiptap/extension-code-block-lowlight |
| 하이라이팅 | lowlight (common — 36개 언어, VS Code Dark+ 테마) |
| 백엔드 | Supabase Auth, Supabase Postgres |
| 미래 협업 | Yjs, Hocuspocus (설치만, 미연결) |

---

## 아키텍처

```
app/
  layout.tsx                      # 루트 레이아웃
  page.tsx                        # 진입점 → NotionLiteApp 렌더
  globals.css                     # 전역 스타일 (ProseMirror, hljs 토큰 등)
  api/
    _utils/auth.ts                # JWT 검증 · 워크스페이스 권한 헬퍼
    pages/route.ts                # GET(목록·단건) / POST / PATCH / DELETE
    workspaces/route.ts           # GET / POST / PATCH
    workspaces/[id]/members/      # GET / POST

components/
  auth-panel.tsx                  # 로그인 / 회원가입 폼
  notion-lite-app.tsx             # 앱 전체 상태 관리 · 사이드바 · 헤더
  document-editor.tsx             # Tiptap 에디터 (표, 코드 블록, 붙여넣기 파싱)

lib/
  supabase-admin.ts               # service role 클라이언트 (서버 전용)
  supabase-browser.ts             # anon 클라이언트 (브라우저)

supabase/
  migrations/
    001_init.sql
    002_notion_lite.sql
    003_workspace_member_order.sql

docs/
  plans/
    PLAN_20260513.md              # 초기 스프레드시트 PoC 계획
    PLAN_20260514.md              # Notion-lite 피벗 및 현재 계획
  history/
    DEV_260526.md                 # 2026-05-26 개발 변경 기록
    DEV_260527.md                 # 2026-05-27 이메일 인증 개선 · 코드 리뷰 이슈
```

---

## 주요 기능

**인증 · 워크스페이스**
- 이메일 회원가입 / 로그인 (Supabase Auth)
- 회원가입 후 이메일 인증 필수 (Supabase Email Confirmations ON)
- 미인증 상태 로그인 시 한국어 안내 메시지 + 인증 메일 재발송 버튼 표시
- 인증 메일 리다이렉트 URL은 `NEXT_PUBLIC_SITE_URL` 환경변수로 고정 (localhost 발송 방지)
- 워크스페이스 생성, 조회, 이름 변경
- 커스텀 워크스페이스 스위처
- 워크스페이스 드래그 순서 변경 (사용자별 `workspace_members.order_index` 저장)
- 멤버 이메일 초대 · 역할 기반 권한: `owner` / `editor` / `viewer`
- 잘못된 refresh token 자동 정리

**페이지**
- `parent_id` 기반 중첩 페이지 트리
- 페이지 생성, 삭제
- 사이드바 드래그로 페이지 순서 변경 (같은 레벨 내 형제끼리)
- 사이드바(워크스페이스 + 페이지 목록) 스크롤 시 고정 — 에디터 영역만 스크롤됨
- 페이지 전환 시 서버에서 최신 content 자동 fetch → "불러옴" 배지 표시 (노란색)
- 서버 데이터 로드는 저장 트리거 없음 — 사용자 편집 시에만 저장 (Tiptap `emitUpdate: false`)
- 페이지별 에디터 인스턴스 분리 (`key={page.id}`)로 페이지 전환 중 이전 문서 상태가 섞이지 않도록 방지
- 페이지 로딩 중에는 에디터 저장 트리거를 무시하고, 서버 최신본 반영 시 stale pending content를 정리

**에디터**
- 문서 제목 수정 (blur 저장)
- 본문 자동 저장 (1.5초 디바운스) → Supabase `pages.content` JSONB에 Tiptap 문서 전체 저장
- 수동 새로고침 전 미저장 디바운스 내용을 먼저 저장한 뒤 서버 데이터를 다시 불러옴
- 저장 상태 배지: `저장됨` (초록, 현재 페이지 자동 저장 완료 시) · `불러옴` (노란색, 페이지 전환 및 새로고침 시) — fade-out 중에도 마지막 실제 상태 텍스트를 유지
- 개발 환경에서는 `[save-flow]` 콘솔 로그로 page load, editor update, autosave schedule, PATCH start/success 흐름을 확인 가능
- Tiptap 표: 열 너비 조절, 행 높이 드래그 조절
- 목록 `Tab` / `Shift+Tab` 들여쓰기 조절

**붙여넣기 변환**
- 마크다운 파이프 표 → 편집 가능한 표 (divider 행 유무 무관)
  - 셀 인라인 파싱: `**bold**` `__bold__` `*italic*` `_italic_` `~~strike~~` `` `code` `` 링크
- 펜스 코드 블록(` ```lang ``` `) → 코드 블록 노드 (syntax highlighting 적용)
- ` ```mermaid ``` ` → Mermaid 다이어그램 노드 (바로 렌더링)

**코드 블록**
- lowlight 기반 syntax highlighting (36개 언어, VS Code Dark+ 테마)
- 좌측 상단 언어 배지 (언어별 고유 색상)

**Mermaid 다이어그램**
- ` ```mermaid ``` ` 붙여넣기 시 다이어그램으로 즉시 렌더링
- flowchart, sequenceDiagram, classDiagram 등 Mermaid 전체 문법 지원
- **편집** 버튼으로 소스 수정 후 저장 가능
- 렌더링 오류 시 오류 메시지 표시

---

## 현재 제약

- 실시간 동시 편집 미연결 (페이지 전환 시 fetch, 헤더 새로고침 버튼으로 수동 동기화)
- 본문 저장은 문서 JSON 전체 덮어쓰기 방식이므로, 여러 사용자가 같은 페이지를 동시에 편집하면 마지막 저장이 이전 저장을 덮을 수 있음
- 페이지를 다른 부모로 이동 (트리 구조 변경) 불가
- 멤버 제거 / 역할 변경 UI 없음
- 초대 메일 발송 없음
- 파일 업로드 없음

## 추가 개발 예정

- **충돌 감지 / 버전 관리**: `updated_at` 또는 별도 revision 값을 이용해 오래된 클라이언트의 전체 덮어쓰기 저장을 차단
- **되돌리기(Undo) 히스토리**: 동시 작업 중 내용이 꼬일 경우 이전 상태로 복원 — 페이지별 버전 스냅샷 또는 Tiptap History 기반 서버 측 undo 스택 고려

10. 표 열 너비는 기본 Tiptap 리사이즈로 조절합니다.
11. 표 행 높이는 행 하단 경계 드래그로 조절합니다.
12. 설정 메뉴에서 멤버 목록을 확인하고, 가입된 사용자 이메일로 멤버를 추가합니다.
13. 다른 사용자 변경 사항은 최상단 새로고침 버튼으로 다시 불러옵니다.

## 권한 모델

```txt
owner
- 워크스페이스 이름 변경
- 멤버 추가
- 페이지 생성 / 수정 / 삭제
- 문서 편집

editor
- 페이지 생성 / 수정 / 삭제
- 문서 편집

viewer
- 읽기 전용
```

멤버 추가는 초대 링크나 메일 발송이 아니라, 이미 가입 및 이메일 인증을 완료한 사용자의 이메일을 찾아 `workspace_members`에 추가하는 방식입니다.

## API

```txt
GET    /api/workspaces
POST   /api/workspaces
PATCH  /api/workspaces

GET    /api/pages?workspaceId=...
POST   /api/pages
PATCH  /api/pages
DELETE /api/pages?id=...

GET    /api/workspaces/:id/members
POST   /api/workspaces/:id/members
```

멤버 추가 요청 예시:

```json
{
  "email": "user@example.com",
  "role": "editor"
}
```

## UI 메모

- 최상단 헤더는 스크롤 중에도 고정됩니다.
- 좌측 사이드바(워크스페이스 선택 + 페이지 목록)는 스크롤 시에도 고정됩니다. 에디터 영역만 독립적으로 스크롤됩니다.
- 좌측 사이드바에서 워크스페이스와 페이지를 관리합니다.
- 워크스페이스 선택은 네이티브 select가 아니라 커스텀 드롭다운입니다.
- 워크스페이스 역할 상태는 `owner` = `●`, `editor` = `◆`, `viewer` = `○`로 표시합니다.
- 워크스페이스 드롭다운에서 항목을 드래그하면 사용자별 표시 순서가 저장됩니다.
- 페이지 목록의 긴 제목은 버튼 안에서 `...`으로 말줄임 처리됩니다.
- 페이지 목록의 하위 페이지 추가 / 삭제 버튼은 해당 행 hover 또는 focus 때만 보입니다.
- 페이지 헤더는 `워크스페이스 / 상위 페이지 / 현재 페이지` 형태의 경로형 제목입니다.
- 문서 저장 상태는 페이지 헤더 우측에 고정 폭 배지로 표시합니다.
- 별도 편집 도구 패널은 두지 않습니다.
- 목록은 `Tab` / `Shift+Tab`으로 계층 조절이 가능합니다.
- 표 행 높이는 표 행 하단 경계를 드래그해서 조절합니다.

## 다음 작업 후보

- Yjs + Hocuspocus 실시간 협업 연결
- 브라우저 포커스 복귀 시 자동 동기화
- 멤버 제거 / 역할 변경
- 페이지 이동
- 페이지 snapshot / history
- 초대 메일 또는 공유 링크

## 문서

프로젝트 문서는 `docs/plans`와 `docs/history`를 기준으로 관리합니다.

```txt
docs/plans/PLAN_YYYYMMDD.md
docs/history/DEV_YYMMDD.md
```

이전 `docs/specs` 문서는 날짜별 plan 문서로 통합했습니다.
