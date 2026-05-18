# Cowork26

Next.js, Supabase, Tiptap 기반의 Notion-lite 협업 문서 앱입니다.

워크스페이스 단위로 페이지를 만들고, 멤버를 추가하고, 문서를 자동 저장하는 PoC입니다. 실시간 동시 편집은 아직 연결하지 않았고, 다른 사용자의 변경 사항은 헤더의 새로고침 버튼으로 다시 불러오는 구조입니다.

## 주요 기능

- 이메일 회원가입 / 로그인
- Supabase Auth 세션 처리
- 워크스페이스 생성, 조회, 이름 변경
- 워크스페이스 멤버 조회 및 이메일 기반 추가
- 역할 기반 권한 처리: `owner`, `editor`, `viewer`
- 페이지 생성, 삭제
- `parent_id` 기반 중첩 페이지 트리
- Tiptap 기반 문서 편집
- 문서 제목 blur 저장
- 본문 자동 저장
- 저장 상태 표시: 페이지 헤더 우측 `저장 중` / `저장됨`
- 마크다운 표 붙여넣기 변환 (`**bold**`, `__bold__`, `*italic*`, `_italic_`, `~~strike~~`, `` `code` ``, 링크 인라인 파싱 포함)
- divider 행(`---|---`) 없는 파이프 구분 표도 붙여넣기 변환 지원
- 펜스 코드 블록(` ```python ``` `) 붙여넣기 시 코드 블록 노드로 자동 변환
- syntax highlighting (lowlight 기반 36개 언어 지원, VS Code Dark+ 테마)
- 코드 블록 우측 상단 언어 배지 표시 (언어별 고유 색상)
- 목록 입력 후 `Tab` / `Shift+Tab` 들여쓰기 조절
- Tiptap 표 열 너비 조절
- 표 행 높이 드래그 조절
- 최상단 앱 헤더 sticky 고정
- 설정 메뉴 바깥 클릭 시 자동 닫힘
- 잘못된 refresh token 자동 정리

## 현재 제약

- 실시간 동시 편집 미연결
- Yjs / Hocuspocus 의존성은 설치되어 있지만 앱 플로우에 연결되지 않음
- 자동 동기화 또는 폴링 없음
- 멤버 제거 / 역할 변경 UI 없음
- 초대 메일 발송 없음
- 파일 업로드 없음
- 페이지 순서 변경 없음

## 기술 스택

```txt
App
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Tiptap
- @tiptap/extension-code-block-lowlight
- lowlight (common, 36개 언어)

Backend / Data
- Supabase Auth
- Supabase Postgres
- Supabase service role API route access

Installed for future collaboration work
- Yjs
- Hocuspocus provider
```

## 프로젝트 구조

```txt
app/
  api/
    _utils/auth.ts
    pages/route.ts
    workspaces/route.ts
    workspaces/[id]/members/route.ts
  globals.css
  layout.tsx
  page.tsx

components/
  auth-panel.tsx
  document-editor.tsx
  notion-lite-app.tsx

lib/
  supabase-admin.ts
  supabase-browser.ts

supabase/
  migrations/
    001_init.sql
    002_notion_lite.sql
```

## 실행

```bash
npm install
npm run dev
```

기본 주소:

```txt
http://localhost:3000
```

검증:

```bash
npm run typecheck
npm run build
```

## 환경 변수

`.env.local`에 Supabase 값을 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

배포 환경에서는 `NEXT_PUBLIC_SITE_URL`을 실제 도메인으로 설정합니다.

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

## Supabase 세팅

필수 마이그레이션:

```txt
supabase/migrations/002_notion_lite.sql
```

핵심 테이블:

```txt
workspaces
workspace_members
pages
```

권한과 멤버십 확인은 API route에서 Supabase service role 클라이언트로 처리합니다.

## 사용 흐름

1. 사용자가 회원가입 또는 로그인합니다.
2. 워크스페이스를 생성합니다.
3. 워크스페이스 생성 시 기본 `Welcome` 페이지가 함께 생성됩니다.
4. 좌측 사이드바에서 페이지를 선택하거나 새 페이지를 만듭니다.
5. 페이지 제목은 문서 상단 경로 헤더에서 바로 수정합니다.
6. 문서 본문은 입력 후 자동 저장됩니다.
7. 저장 상태는 페이지 헤더 우측에 표시됩니다.
8. 마크다운 표를 붙여넣으면 편집 가능한 표로 변환됩니다.
9. `-`, `1.` 등으로 만든 목록은 `Tab` / `Shift+Tab`으로 들여쓰기와 내어쓰기를 조절합니다.
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

멤버 추가는 초대 링크나 메일 발송이 아니라, 이미 가입된 사용자의 이메일을 찾아 `workspace_members`에 추가하는 방식입니다.

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
- 좌측 사이드바에서 워크스페이스와 페이지를 관리합니다.
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
- 페이지 순서 변경
- 페이지 이동
- 페이지 snapshot / history
- 초대 메일 또는 공유 링크
