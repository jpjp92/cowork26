# Notion-lite 협업 문서 정리 도구 설계

> 작성일: 2026-05-14

---

## 1. 제품 방향

Cowork26의 방향을 협업 스프레드시트에서 **4~5인용 실시간 협업 문서 정리 도구**로 전환한다.

목표는 Notion과 Confluence의 핵심 경험만 가볍게 가져온 PoC다. 여러 명이 같은 워크스페이스에서 페이지를 만들고, 자료를 정리하고, 문서를 실시간으로 함께 편집할 수 있게 한다.

```txt
목표: 4~5명이 문서/자료를 공동 정리하는 웹앱
형태: Notion + Confluence lite
핵심: 실시간 공동 편집, 페이지 트리, 문서 정리
배포: Vercel + Supabase + Railway
```

현재 구현은 Next.js 기반 단일 문서 편집 PoC까지 진행된 상태다. 로그인, 워크스페이스/페이지 CRUD, 페이지 트리, Tiptap 에디터, 표 편집, 마크다운 표 붙여넣기 변환, 자동 저장, 기본 레이아웃이 들어가 있다.

---

## 2. 피벗 배경

기존 스프레드시트 방향은 FortuneSheet + Supabase Realtime broadcast 기반이었다. 이 조합은 빠른 UI 구성에는 유리하지만, 실시간 협업 제품으로 완성하려면 아래 문제를 직접 해결해야 한다.

- 셀 변경 저장과 실시간 브로드캐스트의 권한 모델 분리
- 뷰어/편집자 권한과 클라이언트 편집 이벤트 차단
- 셀 삭제, 충돌, 배치 저장, presence/cursor 처리
- 스프레드시트 도메인 특유의 수식/셀 상태 관리

반면 문서 협업은 Tiptap + Yjs + Hocuspocus 조합이 목적에 더 잘 맞는다. CRDT 기반 동시 편집, 커서/presence, WebSocket 동기화, 서버 인증 hook, persistence를 중심 구조로 잡을 수 있다.

---

## 3. 권장 기술 스택

```txt
Frontend
- Next.js
- React + TypeScript
- Tiptap Editor
- Tailwind CSS
- Workspace-first UI

Collaboration
- Yjs
- Hocuspocus

Backend / DB
- Supabase Auth
- Supabase Postgres
- Supabase Storage

Deploy
- Vercel: Next.js app
- Railway: Hocuspocus WebSocket server
```

역할 분리는 다음과 같이 잡는다.

```txt
Supabase
- 사용자 인증
- 워크스페이스/멤버/페이지 메타데이터
- 문서 스냅샷 또는 Yjs state 저장
- 파일 업로드 저장소

Hocuspocus
- Yjs WebSocket sync
- 문서별 인증/인가
- 사용자 cursor / presence
- 문서 상태 load/store hook

Tiptap
- 문서 편집 UI
- block 기반 작성 경험
- Yjs Collaboration extension 연동
```

---

## 4. 아키텍처

```txt
[User Browser]
   │
   ├─ Next.js App on Vercel
   │   ├─ 로그인 / 세션 관리
   │   ├─ 워크스페이스 목록
   │   ├─ 페이지 트리
   │   └─ Tiptap Editor
   │
   ├─ Supabase
   │   ├─ Auth
   │   ├─ workspace / page metadata
   │   ├─ document snapshot / ydoc_state
   │   └─ file storage
   │
   └─ Hocuspocus Server on Railway
       ├─ Yjs realtime sync
       ├─ authorization by workspace/page membership
       ├─ cursor / presence
       └─ document state persistence
```

문서 편집 흐름:

```txt
1. 사용자가 페이지를 연다.
2. Next.js가 Supabase 세션과 page metadata를 확인한다.
3. Tiptap editor가 HocuspocusProvider로 page document에 연결한다.
4. Hocuspocus가 token과 document name으로 접근 권한을 확인한다.
5. Yjs update가 WebSocket으로 실시간 동기화된다.
6. Hocuspocus persistence hook이 ydoc_state를 Supabase에 저장한다.
```

---

## 5. 핵심 기능 범위

### 현재 구현 완료

```txt
1. Supabase Auth 로그인 / 로그아웃
2. 워크스페이스 생성 / 조회
3. 페이지 생성 / 삭제
4. parent_id 기반 페이지 트리
5. Tiptap 단일 문서 편집기
6. 표 추가 / 행 추가 / 열 추가 / 행 삭제 / 열 삭제 / 표 삭제
7. 마크다운 표 붙여넣기 후 편집 가능한 표로 변환
8. 본문 자동 저장
9. 페이지 제목 blur 저장
10. 설정 메뉴 기반 로그아웃
```

### PoC 필수

```txt
1. 로그인
2. 워크스페이스 생성
3. 페이지 생성 / 수정 / 삭제
4. parent_id 기반 페이지 트리
5. Tiptap 기본 에디터
6. Yjs 기반 실시간 동시 편집
7. 사용자 커서 / 접속자 표시
8. Supabase에 문서 상태 저장
```

### PoC 제외

```txt
- Redis
- 복잡한 권한 체계
- 댓글
- 멘션
- 알림
- 문서 승인 워크플로우
- RAG 검색
- AI 요약/정리
- Markdown 탭 / Markdown preview
- 버전 diff UI
- 모바일 최적화
- 오프라인 편집
```

---

## 6. DB 설계 초안

PoC에서는 스냅샷 히스토리 테이블을 별도로 만들기보다 `pages`에 최신 문서 상태를 저장한다. 버전 히스토리가 필요해지면 이후 `page_snapshots` 테이블로 분리한다.

```sql
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz default now()
);

create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'editor',
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

create table pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references pages(id) on delete cascade,
  title text not null default 'Untitled',
  order_index int not null default 0,
  content jsonb,
  ydoc_state bytea,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

향후 버전 히스토리 확장 시:

```sql
create table page_snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id) on delete cascade,
  content jsonb,
  ydoc_state bytea,
  created_by uuid,
  created_at timestamptz default now()
);
```

---

## 7. 권한 모델

PoC 권한은 단순하게 유지한다.

```txt
owner
- workspace 삭제
- member 관리
- 모든 page 편집

editor
- page 생성 / 수정 / 삭제
- 실시간 문서 편집

viewer
- page 조회
- 문서 편집 불가
```

Hocuspocus 연결 시 document name은 다음 형식으로 사용한다.

```txt
page:{page_id}
```

서버는 `page_id`로 `pages -> workspace_members`를 조회해 접속자의 권한을 확인한다.

---

## 8. UI 스타일

초기 brutalism 방향에서, 현재는 `sample_design` 레퍼런스를 반영한 **workspace-centered minimalist layout + 강한 포인트 액션**으로 조정한다.

```txt
스타일 원칙:
- 좌측 고정 사이드바 + 상단 헤더
- 중앙 문서 캔버스
- 중성 배경 위 검정 border와 accent color 사용
- 페이지 액션은 hover 시 노출
- 헤더 액션은 최소화하고 설정 메뉴로 수렴
```

현재 UI 원칙:

```txt
- 헤더 우측에는 설정 아이콘만 둔다
- 페이지 삭제/하위 페이지 추가는 사이드바 항목에서 관리한다
- 문서 모드는 단일 Tiptap 편집기만 유지한다
- Markdown 탭은 제거하되, 마크다운 표 붙여넣기는 Tiptap 표로 변환한다
- 표 편집 액션은 편집기 상단 툴바에서 제공한다
- 저장 상태 표시는 고정 높이 영역에서 처리해 본문 레이아웃이 흔들리지 않게 한다
- 설명성 배지와 불필요한 PoC 워딩은 제거한다
```

---

## 9. 개발 순서

```txt
1단계: 현재 스프레드시트 PoC 보존 또는 브랜치 분리
2단계: Next.js + TypeScript + Tailwind 재스캐폴딩
3단계: Supabase Auth 연결
4단계: workspace / pages CRUD
5단계: 사이드바 페이지 트리 구현
6단계: Tiptap 단일 사용자 에디터 연결
7단계: 표 편집 / 마크다운 표 붙여넣기 변환
8단계: 자동 저장 안정화 / 편집 버벅임 제거
9단계: Hocuspocus + Yjs 실시간 편집 연결
10단계: Hocuspocus 인증/인가 구현
11단계: Supabase ydoc_state 저장/복원
12단계: 접속자 표시 / 커서 표시
13단계: Vercel + Railway 배포
```

---

## 10. 최종 결론

```txt
PoC 추천 조합:
Next.js + Tiptap + Yjs + Hocuspocus + Supabase + Vercel + Railway

제품 방향:
Notion-lite 협업 문서 정리 도구

핵심 차별점:
실시간 공동 편집 + 페이지 트리 기반 문서 정리
```

이 방향은 기존 스프레드시트 협업보다 PoC의 제품 메시지가 명확하고, 협업 편집의 핵심 문제를 검증된 편집/CRDT 스택에 맡길 수 있어 기술 리스크가 더 낮다.
