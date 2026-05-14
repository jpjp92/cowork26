# Cowork26

Cowork26는 `Next.js + Supabase + Tiptap` 기반의 Notion-lite 협업 문서 정리 도구다.

현재는 워크스페이스와 페이지를 만들고, 문서를 작성하고, 멤버를 추가하는 PoC 단계다. 실시간 동시 편집은 아직 붙지 않았고, 본문은 자동 저장 방식으로 동작한다. 다른 사용자의 변경 내용은 수동 새로고침으로 다시 불러오는 구조다.

## 현재 구현 범위

- 이메일 회원가입 / 로그인
- Supabase Auth 기반 세션 처리
- 워크스페이스 생성 / 조회
- 워크스페이스명 수정
- 페이지 생성 / 삭제
- `parent_id` 기반 페이지 트리
- Tiptap 문서 편집기
- 본문 자동 저장
- 제목 blur 저장
- 설정 메뉴에서 멤버 목록 조회
- 설정 메뉴에서 멤버 이메일 추가
- 수동 새로고침 버튼
- 잘못된 refresh token 자동 정리

## 기술 스택

```txt
Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Tiptap

Backend / Data
- Supabase Auth
- Supabase Postgres

Planned
- Yjs
- Hocuspocus
```

## 프로젝트 구조

```txt
app/
  api/
    _utils/auth.ts
    pages/route.ts
    workspaces/route.ts
    workspaces/[id]/members/route.ts
  layout.tsx
  page.tsx
  globals.css

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

## 실행 방법

```bash
npm install
npm run dev
```

기본 로컬 주소:

```txt
http://localhost:3000
```

검증:

```bash
npm run typecheck
npm run build
```

## 환경 변수

`.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

현재 `next.config.ts`에서 기존 Vite 변수도 fallback으로 읽는다.

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

운영 배포 기준 권장값:

```env
NEXT_PUBLIC_SITE_URL=https://cowork26.vercel.app
```

## Supabase 세팅

필수 마이그레이션:

```txt
supabase/migrations/002_notion_lite.sql
```

이 마이그레이션이 생성하는 핵심 테이블:

```txt
workspaces
workspace_members
pages
```

추가 참고:

- [docs/superpowers/plans/2026-05-14-supabase-notion-lite-setup.md](/home/jpjp92/devs/github/collab-sheets/docs/superpowers/plans/2026-05-14-supabase-notion-lite-setup.md)
- [docs/superpowers/specs/2026-05-14-notion-lite-collab-docs-design.md](/home/jpjp92/devs/github/collab-sheets/docs/superpowers/specs/2026-05-14-notion-lite-collab-docs-design.md)

## 기본 플로우

1. 사용자가 회원가입 또는 로그인한다.
2. 워크스페이스를 생성한다.
3. 생성 직후 기본 `Welcome` 페이지가 함께 만들어진다.
4. 좌측 사이드바에서 페이지를 선택하거나 새 페이지를 만든다.
5. 워크스페이스 owner는 사이드바에서 워크스페이스명을 수정할 수 있다.
6. 문서 본문은 입력 후 약 1.5초 뒤 자동 저장된다.
7. 문서 제목은 상단 탭형 UI에서 수정하고 blur 시 저장된다.
8. 설정 메뉴에서 현재 워크스페이스 멤버를 확인하고 이메일로 추가할 수 있다.
9. 다른 사용자의 변경은 헤더 우측 새로고침 버튼으로 다시 불러올 수 있다.

## 권한 모델

```txt
owner
- 워크스페이스 owner
- 워크스페이스명 수정 가능
- 멤버 추가 가능
- 페이지 생성 / 수정 / 삭제 가능

editor
- 페이지 생성 / 수정 / 삭제 가능

viewer
- 읽기 전용
```

현재 멤버 추가는 "공유 링크"가 아니라 "이미 가입된 사용자 이메일을 workspace_members에 추가"하는 방식이다.

## 주요 API

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

## 현재 제약

- 실시간 동시 편집 없음
- Yjs / Hocuspocus 미연결
- 자동 새로고침 없음
- 멤버 제거 / role 변경 UI 없음
- 초대 메일 발송 없음
- 파일 업로드 없음

## UI 메모

- 좌측 사이드바에서 워크스페이스와 페이지를 관리한다.
- 헤더 우측에는 새로고침 버튼과 설정 버튼만 둔다.
- 설정 메뉴에서 멤버 목록, 멤버 추가, 로그아웃을 처리한다.
- 문서 페이지 상단 제목은 탭처럼 보이는 헤더형 입력 UI를 사용한다.

## 다음 작업 후보

- Yjs + Hocuspocus 실시간 협업 연결
- 브라우저 포커스 복귀 시 자동 동기화
- 멤버 제거 / role 변경
- 페이지 순서 변경
- page snapshot / history
