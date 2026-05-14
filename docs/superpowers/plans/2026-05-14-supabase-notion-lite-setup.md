# Supabase Notion-lite 세팅 순서

> 작성일: 2026-05-14

---

## 목적

Cowork26를 Notion-lite 협업 문서 도구로 실행하기 위한 Supabase DB 세팅 순서다.

현재 앱이 실제로 사용하는 핵심 테이블은 아래 3개다.

```txt
workspaces
workspace_members
pages
```

기존 스프레드시트 PoC에서 사용하던 `sheets`, `sheet_members`, `cells` 테이블은 현재 Next.js Notion-lite 화면에서는 사용하지 않는다.

---

## 1. 먼저 확인할 환경 변수

로컬 `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://cowork26.vercel.app

SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

현재 `next.config.ts`에서 기존 Vite 변수도 fallback으로 읽는다.

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

다만 Vercel/Next 기준으로는 `NEXT_PUBLIC_` 이름을 사용하는 것이 더 명확하다.

회원가입 메일 인증 후 복귀 주소는 `NEXT_PUBLIC_SITE_URL` 또는 현재 브라우저 origin을 사용한다. Supabase Authentication 설정의 Redirect URLs에도 아래 주소를 등록해야 한다.

```txt
https://cowork26.vercel.app
http://localhost:3000
```

---

## 2. SQL 실행 순서

Supabase Dashboard의 `SQL Editor`에서 아래 파일을 실행한다.

### 필수

```txt
supabase/migrations/002_notion_lite.sql
```

이 파일 안에서 생성되는 순서는 다음과 같다.

```txt
1. workspaces
2. workspace_members
3. pages
4. indexes
5. update_pages_updated_at() trigger function
6. pages_updated_at trigger
7. RLS enable
8. RLS policies
```

`002_notion_lite.sql`은 `auth.users`를 직접 참조하므로 `profiles` 테이블이 없어도 동작한다.

### 선택

기존 스프레드시트 PoC도 보존해서 테스트하고 싶다면 아래도 실행할 수 있다.

```txt
supabase/migrations/001_init.sql
```

하지만 Notion-lite 앱만 테스트한다면 `001_init.sql`은 필수가 아니다.

---

## 3. 테이블 역할

### workspaces

워크스페이스 메타데이터.

```txt
id
name
created_by
created_at
```

### workspace_members

워크스페이스 접근 권한.

```txt
workspace_id
user_id
role: owner | editor | viewer
created_at
```

### pages

문서 페이지와 페이지 트리.

```txt
id
workspace_id
parent_id
title
order_index
content
ydoc_state
created_by
updated_by
created_at
updated_at
```

PoC 현재 구현에서는 `content` JSONB에 Tiptap 문서 JSON을 저장한다.
`ydoc_state`는 이후 Yjs/Hocuspocus persistence 단계에서 사용한다.

---

## 4. 정상 동작 확인 순서

1. `002_notion_lite.sql` 실행
2. `npm run dev` 실행
3. 로그인
4. 새 워크스페이스 생성
5. 자동 생성된 `Welcome` 페이지가 선택되는지 확인
6. 페이지 제목/본문 수정
7. 본문 입력 후 약 1.5초 뒤 자동 저장 상태가 반영되는지 확인
8. 새로고침 후 내용이 유지되는지 확인

현재 에디터 관련 메모:

```txt
- Markdown 탭은 제거되었다.
- 단일 Tiptap 문서 편집기만 유지한다.
- 본문 자동 저장은 디바운스(약 1.5초) 방식이다.
- 제목은 blur 시 저장된다.
```

워크스페이스 생성 직후 아무 반응이 없으면 먼저 브라우저 화면 상단의 에러 배너를 확인한다.

대표 에러:

```txt
Could not find the table 'public.workspace_members' in the schema cache
```

해결:

```txt
002_notion_lite.sql이 아직 실행되지 않았거나 Supabase schema cache가 갱신되지 않은 상태다.
SQL 실행 후 10~30초 기다린 뒤 새로고침한다.
```

---

## 5. 다음 DB 작업

다음 단계에서 추가할 가능성이 높은 항목:

```txt
workspace invite API
page order 변경 API
page_snapshots 테이블
Hocuspocus ydoc_state 저장/복원
```
