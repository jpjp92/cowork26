# `notion-lite-app.tsx` 단계적 리팩토링 Implementation Plan

**Goal:** 2,084줄짜리 `components/notion-lite-app.tsx`를 동작 변경 없이 UI 컴포넌트, 순수 도메인 로직, 상태 훅으로 분리해 최종 앱 조립 파일을 약 400~600줄로 줄이고 각 책임을 독립적으로 검증할 수 있게 한다.

**Architecture:** 한 번에 상태 구조를 다시 쓰지 않는다. 먼저 타입과 순수 계산을 분리해 테스트 기반을 만들고, 다음으로 JSX만 표현 컴포넌트로 이동한다. 그 후 비교적 독립적인 UI 상태 훅을 분리하고, 마지막에 저장·라우팅·데이터 로딩처럼 경쟁 조건이 있는 로직을 하나씩 옮긴다. 각 단계는 별도 검증을 통과해야 다음 단계로 진행한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Tailwind CSS v4, 브라우저 History API.

---

## 현재 상태

`components/notion-lite-app.tsx` 기준:

- 총 2,084줄
- `useState`: 32개
- `useRef`: 21개
- `useEffect`: 20개
- `useCallback`: 19개
- `fetch`: 16개

한 파일이 담당하는 책임:

1. Supabase 인증 세션 초기화와 로그아웃 상태 정리
2. 워크스페이스 목록·순서·생성·이름 변경
3. 멤버 조회·초대
4. 페이지 목록 캐시·재검증·생성·삭제·이동
5. 문서 제목·본문 저장, debounce, 미저장 상태 보존
6. 이미지 업로드·복제
7. 짧은 URL, 기존 URL, History API, 뒤로/앞으로 이동
8. 페이지 트리 구성·접힘 상태·드래그앤드롭
9. 사이드바 크기 조절
10. 헤더·설정·워크스페이스 메뉴·사이드바·편집기·모달 전체 JSX

## 핵심 원칙

- 리팩토링 중 API·DB 스키마·URL 계약·UI 디자인을 변경하지 않는다.
- “파일 길이 감소”만을 위해 1,000줄짜리 거대 훅으로 이동하지 않는다.
- 상태 소유권과 비동기 경쟁 조건을 명확히 한 뒤 훅을 분리한다.
- 순수 계산과 표현 컴포넌트를 먼저 옮겨 위험한 상태 변경 범위를 최소화한다.
- 한 단계에서 UI 추출과 상태 구조 변경을 동시에 하지 않는다.
- 새 상태 관리 라이브러리를 도입하지 않는다.
- 현재 작업 트리의 URL 단축 변경과 무관한 사용자 수정은 보존한다.

## 제외 범위

- UI 재디자인
- API 엔드포인트 변경
- Supabase 스키마 변경
- 저장 debounce 시간 또는 재검증 주기 변경
- 전역 상태 라이브러리 도입
- React Query/SWR 도입
- 성능 프로파일링 없이 무분별한 `memo` 적용

## 성공 조건

- `notion-lite-app.tsx`가 인증 분기와 기능 모듈 조립 중심의 400~600줄 수준이 된다.
- 개별 UI 컴포넌트는 가급적 300줄 이하, 개별 훅은 가급적 350줄 이하를 유지한다.
- 페이지 저장, 빠른 페이지 전환, URL 복원, optimistic create/delete 동작이 유지된다.
- 순수 페이지 트리·이동·삭제 계산에 단위 테스트가 생긴다.
- 기존 URL 테스트, 에디터 붙여넣기 테스트, 타입 검사가 계속 통과한다.
- 로그인된 브라우저 핵심 시나리오가 리팩토링 전후 동일하다.

---

## 목표 파일 구조

```txt
components/
  notion-lite-app.tsx                 # 최종 조립/인증 분기
  notion-lite/
    app-header.tsx
    settings-panel.tsx
    workspace-sidebar.tsx
    workspace-menu.tsx
    page-tree.tsx
    document-pane.tsx
    delete-page-dialog.tsx
    loading-states.tsx

hooks/
  use-sidebar-width.ts
  use-collapsed-pages.ts
  use-page-persistence.ts
  use-selection-navigation.ts
  use-workspace-data.ts
  use-page-data.ts

lib/notion-lite/
  types.ts
  page-tree.ts
  page-move.ts
  api.ts

scripts/
  notion-lite-page-tree-test.mjs
  notion-lite-page-move-test.mjs
```

파일명은 구현 중 실제 결합도를 보고 합치거나 나눌 수 있지만 책임 경계는 유지한다.

---

## Phase 0 — 기준선 고정

### Task 0.1: 현재 동작과 변경 범위 기록

**Files:**

- Read: `components/notion-lite-app.tsx`
- Read: `docs/history/DEV_260722.md`
- Read: `docs/plans/PLAN_20260722_SHORT_PAGE_URL.md`

- [ ] 리팩토링 시작 전 `git status --short`와 변경 파일을 확인한다.
- [ ] URL 단축 작업이 커밋되지 않았다면 해당 변경과 리팩토링 변경을 논리적으로 구분해 diff를 검토한다.
- [ ] 현재 파일의 줄 수와 hook/fetch 개수를 기록한다.

### Task 0.2: 자동 검증 기준선 실행

```sh
node scripts/selection-route-test.mjs
npm run test:editor-paste-priority
npm run typecheck
git diff --check
```

- [ ] 모두 통과한 상태에서 리팩토링을 시작한다.
- [ ] 실패가 있으면 기존 실패인지 확인하고 리팩토링 전에 해결 범위를 결정한다.

### Task 0.3: 수동 스모크 체크리스트 고정

- [ ] 워크스페이스 전환
- [ ] 페이지 전환 및 짧은 URL 변경
- [ ] 새로고침·직접 접속·뒤로/앞으로
- [ ] 페이지 제목·본문 저장
- [ ] 저장 전에 다른 페이지로 빠르게 이동
- [ ] 페이지 생성·하위 페이지 생성·삭제
- [ ] 페이지 드래그앤드롭
- [ ] 워크스페이스 생성·이름 변경·순서 변경
- [ ] 멤버 조회·초대
- [ ] 검색 결과에서 페이지 열기
- [ ] 이미지 업로드·복제

**완료 조건:** 리팩토링 전 기준선 결과와 수동 시나리오가 문서화된다.

---

## Phase 1 — 공유 타입과 순수 도메인 로직 분리

상태나 JSX를 옮기기 전에 테스트 가능한 계산부터 분리한다.

### Task 1.1: 공통 타입 이동

**Files:**

- Create: `lib/notion-lite/types.ts`
- Modify: `components/notion-lite-app.tsx`
- Modify as needed: 추출되는 신규 컴포넌트·훅

이동 대상:

- `Workspace`
- `PageRecord`
- `WorkspaceMember`
- `UploadedImageAsset`
- `PageDropPosition`
- 저장 상태와 공통 callback 타입

- [ ] 타입을 export하고 기존 파일에서 import한다.
- [ ] 런타임 코드는 변경하지 않는다.
- [ ] API 응답 필드와 UI용 필드를 임의로 축소하지 않는다.

**검증:** `npm run typecheck`

### Task 1.2: 페이지 트리·breadcrumb·삭제 계산 분리

**Files:**

- Create: `lib/notion-lite/page-tree.ts`
- Create: `scripts/notion-lite-page-tree-test.mjs`
- Modify: `components/notion-lite-app.tsx`

예상 인터페이스:

```ts
export function buildPageTree(pages: PageRecord[]): Map<string, PageRecord[]>
export function getPageTrail(pageId: string, pages: PageRecord[]): PageRecord[]
export function collectPageAndDescendantIds(pageId: string, pages: PageRecord[]): Set<string>
export function getDefaultCollapsedPageIds(pages: PageRecord[], collapseFromDepth: number): Set<string>
```

테스트 범위:

- order index와 created_at 정렬
- 다단계 breadcrumb
- parent cycle 방어
- 전체 하위 페이지 수집
- 존재하지 않는 page ID
- depth 기반 기본 접힘

- [ ] 테스트를 먼저 작성해 기존 인라인 로직과 동일한 기대값을 고정한다.
- [ ] 순수 함수를 구현하고 컴포넌트의 중복 계산을 교체한다.

### Task 1.3: 페이지 이동 계산 분리

**Files:**

- Create: `lib/notion-lite/page-move.ts`
- Create: `scripts/notion-lite-page-move-test.mjs`
- Modify: `components/notion-lite-app.tsx`

예상 인터페이스:

```ts
export interface PageMoveResult {
  pages: PageRecord[]
  changed: PageRecord[]
  expandPageId: string | null
}

export function planPageMove(
  pages: PageRecord[],
  draggedId: string,
  targetId: string,
  position: PageDropPosition,
): PageMoveResult | null
```

테스트 범위:

- 위·아래·내부 이동
- 같은 부모 내 재정렬
- 다른 부모로 이동
- 자기 자신 또는 자신의 하위로 이동 방지
- 관련 부모 그룹의 `order_index` 재계산
- 변경 없음 처리

**완료 조건:** 페이지 구조 계산이 React state와 API 호출에서 분리되고 Node 단위 테스트로 검증된다.

---

## Phase 2 — 저위험 표현 컴포넌트 추출

이 단계에서는 state와 mutation 함수의 소유권을 `notion-lite-app.tsx`에 유지한다. JSX와 이벤트 전달만 분리한다.

### Task 2.1: 로딩·빈 상태 컴포넌트

**Files:**

- Create: `components/notion-lite/loading-states.tsx`
- Modify: `components/notion-lite-app.tsx`

이동 대상:

- `PageTreeSkeleton`
- `DocumentSkeleton`
- `MembersSkeleton`
- 문서 미선택 통계/안내 화면

- [ ] 클래스 이름과 DOM 구조를 그대로 이동한다.
- [ ] loading 조건은 부모가 계산해 boolean/데이터로 전달한다.

### Task 2.2: 삭제 확인 모달

**Files:**

- Create: `components/notion-lite/delete-page-dialog.tsx`
- Modify: `components/notion-lite-app.tsx`

예상 props:

```ts
interface DeletePageDialogProps {
  page: PageRecord | null
  hasChildren: boolean
  onCancel: () => void
  onConfirm: (pageId: string) => void
}
```

- [ ] Esc 및 backdrop 닫기 동작을 보존한다.
- [ ] 실제 삭제 mutation은 부모 callback으로 유지한다.

### Task 2.3: 문서 패널

**Files:**

- Create: `components/notion-lite/document-pane.tsx`
- Modify: `components/notion-lite-app.tsx`

책임:

- breadcrumb와 제목 input 렌더링
- 저장/불러옴 배지
- `DocumentEditor` 연결
- error banner와 loading/empty UI

- [ ] 제목 변경은 `onTitleChange`, 저장은 `onTitleCommit`으로 구분한다.
- [ ] 본문 저장·이미지 mutation 자체는 부모 callback으로 유지한다.
- [ ] `DocumentEditor`의 `ssr: false` 동적 import 위치를 한 곳으로 유지한다.

### Task 2.4: 페이지 트리 표현 컴포넌트

**Files:**

- Create: `components/notion-lite/page-tree.tsx`
- Modify: `components/notion-lite-app.tsx`

예상 props:

```ts
interface PageTreeProps {
  tree: Map<string, PageRecord[]>
  activePageId: string
  collapsedPageIds: Set<string>
  canEdit: boolean
  dragOver: { id: string; position: PageDropPosition } | null
  onOpen: (pageId: string) => void
  onToggleCollapse: (pageId: string) => void
  onCreateChild: (pageId: string) => void
  onRequestDelete: (pageId: string) => void
  onDownloadMarkdown: (page: PageRecord) => void
  onMove: (draggedId: string, targetId: string, position: PageDropPosition) => void
  onDragOverChange: (...) => void
}
```

- [ ] 재귀 렌더링과 drag 위치 계산만 컴포넌트가 담당한다.
- [ ] API 저장과 optimistic rollback은 부모에 남긴다.
- [ ] Markdown 다운로드는 별도 callback으로 전달해 `pendingContent` ref를 UI가 알지 않게 한다.

### Task 2.5: 헤더·설정·워크스페이스 사이드바

**Files:**

- Create: `components/notion-lite/app-header.tsx`
- Create: `components/notion-lite/settings-panel.tsx`
- Create: `components/notion-lite/workspace-sidebar.tsx`
- Create: `components/notion-lite/workspace-menu.tsx`
- Modify: `components/notion-lite-app.tsx`

- [ ] 메뉴 열림/닫힘 state는 최초 추출 시 부모에 유지한다.
- [ ] outside click ref도 최초에는 부모가 전달해 동작 변화 없이 분리한다.
- [ ] workspace drag data와 callback 계약을 명시한다.
- [ ] 멤버 초대 form 값과 mutation을 임의로 합치지 않는다.

**Phase 2 완료 조건:** JSX 대부분이 기능별 컴포넌트로 이동하고 부모는 기존 state와 callbacks를 props로 조립한다. 이 시점에는 서버 상태 소유권이 바뀌지 않는다.

---

## Phase 3 — 독립 UI 상태 훅 분리

서버 데이터와 무관하거나 결합도가 낮은 effect/ref부터 이동한다.

### Task 3.1: 사이드바 폭 훅

**Files:**

- Create: `hooks/use-sidebar-width.ts`
- Modify: `components/notion-lite-app.tsx`

반환 계약:

```ts
const { sidebarWidth, startSidebarResize } = useSidebarWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
})
```

- [ ] localStorage 복원·저장을 훅 내부로 이동한다.
- [ ] 모바일 resize 무시, cursor와 user-select cleanup을 보존한다.

### Task 3.2: 페이지 접힘 상태 훅

**Files:**

- Create: `hooks/use-collapsed-pages.ts`
- Modify: `components/notion-lite-app.tsx`

반환 계약:

```ts
const {
  collapsedPageIds,
  togglePage,
  revealAncestors,
  expandPage,
} = useCollapsedPages({ workspaceId, pages, collapseFromDepth })
```

- [ ] 워크스페이스별 localStorage 복원/저장 가드를 유지한다.
- [ ] 워크스페이스 전환 직후 이전 pages가 새 key에 저장되지 않게 `workspace_id` 가드를 유지한다.
- [ ] 검색 결과 열기와 inside drop 시 펼침 동작을 보존한다.

### Task 3.3: outside click 훅

**Files:**

- Create: `hooks/use-outside-pointer-down.ts`
- Modify: `components/notion-lite-app.tsx`

- [ ] 설정 패널과 workspace 메뉴의 중복 document listener를 공통 훅으로 교체한다.
- [ ] 비활성 상태에서는 listener를 등록하지 않는다.

**Phase 3 완료 조건:** 로컬 UI effect/ref가 부모에서 제거되고 각 훅의 cleanup 책임이 명확해진다.

---

## Phase 4 — API 경계와 데이터 컨트롤러 분리

### Task 4.1: 타입이 있는 API 모듈

**Files:**

- Create: `lib/notion-lite/api.ts`
- Modify: `components/notion-lite-app.tsx`
- Later Modify: 관련 hooks

함수 그룹:

- workspace: list/create/rename/reorder
- page: list/get/create/update/delete/move batch
- members: list/invite
- assets: upload/clone

원칙:

- Authorization header와 JSON/error parsing을 중앙화한다.
- HTTP method, body shape, endpoint는 변경하지 않는다.
- API 함수는 React state를 직접 수정하지 않는다.
- `AbortSignal`을 받을 수 있게 해 page 조회 취소를 유지한다.

- [ ] endpoint별로 한 그룹씩 교체하고 매번 typecheck한다.
- [ ] 오류 메시지 fallback을 기존 한국어 문구와 동일하게 유지한다.

### Task 4.2: 워크스페이스 데이터 훅

**Files:**

- Create: `hooks/use-workspace-data.ts`
- Modify: `components/notion-lite-app.tsx`

소유 상태:

- `workspaces`, `workspacesLoading`
- `members`, `membersLoading`
- workspace/member mutation loading flags

제공 actions:

- `loadWorkspaces`, `createWorkspace`, `renameWorkspace`, `reorderWorkspaces`
- `loadMembers`, `inviteMember`

주입 dependencies:

- `accessToken`
- `onError`
- 워크스페이스 생성/선택 후 page/navigation을 갱신하는 callback

- [ ] hook이 page cache나 URL을 직접 소유하지 않게 callback 경계를 유지한다.
- [ ] optimistic workspace order rollback을 보존한다.

### Task 4.3: 페이지 데이터 훅

**Files:**

- Create: `hooks/use-page-data.ts`
- Modify: `components/notion-lite-app.tsx`

소유 상태/ref:

- `pages`, `pagesLoading`
- `pagesRef`, workspace별 `pagesCache`
- `pageFetchedAtRef`, `pendingCreateIds`
- page create/delete/move loading 상태

제공 actions:

- `loadPages`, `getCachedPage`, `seedResolvedPage`
- `createPage`, `deletePage`, `movePage`
- `replacePage`, `patchLocalPage`

- [ ] 현재 workspace ID와 늦은 응답 workspace ID 비교 가드를 유지한다.
- [ ] 생성 중 optimistic page가 background revalidation에서 사라지지 않게 유지한다.
- [ ] 삭제 시 하위 페이지와 저장 timer 정리 callback을 호출한다.
- [ ] move rollback에서 원래 page 배열을 복원한다.

**Phase 4 완료 조건:** fetch가 앱 조립 컴포넌트에서 사라지고 typed API 또는 데이터 훅 안에만 존재한다.

---

## Phase 5 — 고위험 저장·라우팅 훅 분리

가장 회귀 위험이 큰 단계다. Phase 1~4가 안정화된 뒤 각각 별도 변경으로 진행한다.

### Task 5.1: 문서 저장 훅

**Files:**

- Create: `hooks/use-page-persistence.ts`
- Modify: `components/notion-lite-app.tsx`
- Integrate: `hooks/use-page-data.ts`

소유 상태/ref:

- `saveTimers`
- `pendingContent`
- `contentSaveInFlight`
- 저장 배지 상태와 reset timer
- 제목 focus 시작값

제공 계약:

```ts
const {
  savingStatus,
  getEffectiveContent,
  updatePage,
  scheduleContentSave,
  flushPendingContentSaves,
  clearPagePersistence,
  markPageCreating,
  finishPageCreating,
} = usePagePersistence(...)
```

필수 불변조건:

- 이전 페이지의 늦은 저장 완료가 현재 페이지에 “저장됨” 배지를 띄우지 않는다.
- background fetch가 미저장/저장 중 content를 덮어쓰지 않는다.
- 생성 중 page는 POST 성공 전 PATCH하지 않는다.
- unmount 시 timer를 모두 정리한다.
- refresh 전에 pending content를 flush한다.

**집중 검증:** 본문 입력 직후 페이지 전환, 생성 직후 즉시 입력, 저장 중 refresh, 저장 실패.

### Task 5.2: 선택·URL 내비게이션 훅

**Files:**

- Create: `hooks/use-selection-navigation.ts`
- Modify: `components/notion-lite-app.tsx`
- Reuse: `lib/selection-route.ts`

소유 상태/ref:

- `activeWorkspaceId`, `activePageId`와 동기 ref
- `routeResolutionSequenceRef`
- `standalonePageIdRef`
- `popstate` listener

외부 의존 계약:

- `getCachedPage(pageId)`
- `resolvePage(pageId)`
- `seedResolvedPage(page)`
- `getFallbackWorkspaceId()`

필수 불변조건:

- `/p/{pageId}` 직접 접속 전에 기본 workspace가 URL을 덮어쓰지 않는다.
- 기존 긴 URL은 페이지 확인 후 짧은 URL로 replace된다.
- `pushState`/`replaceState`가 기존 history state를 보존한다.
- 빠른 뒤로/앞으로 이동 시 오래된 API 응답을 무시한다.
- 로그아웃 후 같은 page URL에서 다시 로그인하면 요청 페이지를 재해석한다.

**집중 검증:** 직접 접속, 새로고침, legacy URL, 같은/다른 workspace 뒤로·앞으로, 권한 없음, 삭제된 page.

### Task 5.3: 이미지 asset 훅 또는 page persistence 통합

**Files:**

- Create if warranted: `hooks/use-page-assets.ts`
- Modify: `components/notion-lite-app.tsx`

- [ ] 이미지 업로드와 clone이 저장 훅과 독립적이면 별도 훅으로 분리한다.
- [ ] 두 함수만 남아 별도 훅이 과도하면 `use-page-persistence`에 포함한다.
- [ ] workspace/page ID 검증과 기존 오류 문구를 유지한다.

**Phase 5 완료 조건:** 앱 조립 컴포넌트는 domain hook 반환값을 UI 컴포넌트에 연결하는 역할만 담당한다.

---

## Phase 6 — 최종 정리와 검증

### Task 6.1: 조립 컴포넌트 정리

- [ ] 파생값은 필요한 최소 `useMemo`만 유지한다.
- [ ] 단순 값 계산에 불필요한 memo를 추가하지 않는다.
- [ ] props가 지나치게 큰 컴포넌트는 관련 view model/action object로 묶되 숨은 전역 context는 만들지 않는다.
- [ ] 임시 compatibility wrapper와 사용하지 않는 ref/state를 제거한다.
- [ ] 중복 조건·주석·dead code를 제거한다.
- [ ] `notion-lite-app.tsx` 줄 수와 hook 개수를 다시 기록한다.

### Task 6.2: 전체 자동 검증

```sh
node scripts/notion-lite-page-tree-test.mjs
node scripts/notion-lite-page-move-test.mjs
node scripts/selection-route-test.mjs
npm run test:editor-paste-priority
npm run typecheck
git diff --check
```

### Task 6.3: 런타임 경로 검증

```sh
curl -I http://10.255.255.254:3000/
curl -I http://10.255.255.254:3000/w/test-workspace-id
curl -I http://10.255.255.254:3000/p/test-page-id
curl -I http://10.255.255.254:3000/w/test-workspace-id/p/test-page-id
```

Expected: 모두 App Router에서 응답하고 신규 404/500이 없다.

### Task 6.4: 로그인 브라우저 회귀 검증

Phase 0의 전체 수동 스모크 체크리스트를 다시 수행한다. 특히 다음을 우선한다.

1. 본문 입력 직후 다른 페이지로 이동해 저장 손실 여부 확인
2. 페이지 생성 직후 입력해 POST/PATCH 순서 확인
3. 다른 workspace 페이지를 뒤로/앞으로 이동해 선택과 URL 확인
4. page drag inside/above/below 후 새로고침해 순서 보존 확인
5. workspace 전환 후 접힘 상태가 다른 workspace localStorage에 섞이지 않는지 확인

### Task 6.5: 개발 이력 갱신

**Files:**

- Modify: `docs/history/DEV_260722.md` 또는 실제 완료 날짜의 `docs/history/DEV_YYMMDD.md`

기록 내용:

- 최종 파일 구조
- `notion-lite-app.tsx` 전후 줄 수
- 분리된 상태 소유권
- 자동·수동 검증 결과
- 남은 기술 부채

---

## 권장 실행 단위

각 단위는 독립 검증 후 다음으로 진행한다.

1. 타입 + page tree 순수 함수
2. page move 순수 함수
3. loading/delete dialog
4. document pane
5. page tree UI
6. header/settings
7. workspace sidebar/menu
8. sidebar/collapse/outside-click hooks
9. typed API
10. workspace data hook
11. page data hook
12. page persistence hook
13. selection navigation hook
14. 최종 cleanup과 전체 회귀 검증

한 단위에서 회귀가 발생하면 그 단위만 되돌릴 수 있게 구현 범위를 유지한다.

## 가장 위험한 단계

### 1. `use-page-persistence`

저장 timer, pending content, 생성 중 page, background revalidation이 서로 연결돼 있다. 이 로직을 부분적으로만 옮기면 저장 손실 또는 중복 PATCH가 생길 수 있다. 관련 ref와 cleanup을 한 번에 같은 훅으로 이동해야 한다.

### 2. `use-selection-navigation`

React state, 동기 ref, History API, 캐시, async page lookup이 함께 동작한다. URL state만 먼저 이동하거나 ref를 부모와 훅 양쪽에 두면 뒤로/앞으로 이동 경쟁이 발생할 수 있다. active ID의 단일 소유자를 훅으로 확정한 뒤 이동한다.

### 3. `use-page-data`

workspace별 cache와 현재 화면 pages를 구분하지 않으면 전환 직후 이전 workspace page가 새 cache에 저장될 수 있다. 현재 `page.workspace_id === activeWorkspaceId` 계열 가드를 계약으로 고정한다.

## 중간 중단 기준

다음 중 하나라도 발생하면 다음 Phase로 넘어가지 않는다.

- typecheck 또는 기존 자동 테스트 실패
- 페이지 저장 내용 유실
- 페이지 생성 직후 404 PATCH 재발
- 새로고침·뒤로/앞으로 URL 불일치
- workspace 전환 후 잘못된 페이지 목록 표시
- drag/drop 후 서버 순서와 UI 순서 불일치
- 추출한 컴포넌트 props가 원본 state 대부분을 그대로 전달받아 책임 분리가 되지 않음

이 계획은 Phase 1부터 순서대로 실행하며, 고위험 Phase 5는 앞 단계가 실제 브라우저에서 안정적일 때만 시작한다.
