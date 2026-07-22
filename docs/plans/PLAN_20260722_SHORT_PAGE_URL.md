# 페이지 URL 단축 Implementation Plan

**Goal:** 페이지 주소를 `/w/{workspaceId}/p/{pageId}`에서 `/p/{pageId}`로 단축하면서 직접 접속, 새로고침, 공유, History API 기반 부드러운 이동, 기존 긴 링크 호환을 모두 유지한다.

**Architecture:** 페이지 UUID는 `pages.id` 기본키로 전역 고유하며 기존 `GET /api/pages?id={pageId}`가 권한 검사 후 `workspace_id`를 반환한다. 따라서 1단계에서는 DB를 변경하지 않고 페이지 ID만 URL에 사용한다. 짧은 경로로 직접 접속하거나 캐시에 없는 페이지로 뒤로/앞으로 이동할 때는 단일 페이지 API로 소속 워크스페이스를 해석한 뒤 기존 워크스페이스 페이지 로딩 흐름에 연결한다. 기존 긴 경로는 호환 라우트로 유지하되 앱이 페이지를 확인한 후 짧은 경로로 `replaceState`한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, 브라우저 History API.

---

## 목표 범위

### 포함

- 새 페이지 경로 `/p/{pageId}`
- 워크스페이스 전용 경로 `/w/{workspaceId}` 유지
- 기존 `/w/{workspaceId}/p/{pageId}` 직접 링크 호환
- 짧은 경로 직접 접속 시 페이지의 `workspace_id` 자동 해석
- History API 기반 페이지 전환 유지
- 뒤로/앞으로 이동 중 캐시에 없는 페이지 해석
- 권한 없음, 삭제된 페이지, 잘못된 경로에 대한 안전한 폴백
- 순수 URL 로직 테스트와 타입·런타임 검증

### 제외

- DB `short_id` 컬럼 추가
- 사람이 읽는 workspace/page slug
- 기존 UUID 기본키 변경
- 공개 페이지 또는 비로그인 공유 링크
- URL에서 문서 제목 노출

## 성공 조건

- 페이지 클릭 시 주소가 `/p/{pageId}`가 되고 앱 셸은 재마운트되지 않는다.
- `/p/{pageId}`를 새 탭에서 열거나 새로고침하면 해당 페이지와 워크스페이스가 선택된다.
- 기존 긴 링크를 열면 동일한 페이지가 표시되고 주소는 `/p/{pageId}`로 정규화된다.
- 뒤로/앞으로 이동이 같은 워크스페이스 및 다른 워크스페이스 페이지 모두에서 동작한다.
- 페이지 API의 기존 멤버십 검사를 우회하지 않는다.
- 빠른 History 이동 중 오래된 응답이 최신 선택을 덮어쓰지 않는다.
- TypeScript, URL 단위 테스트, 동적 경로 HTTP 검증이 통과한다.

---

## Phase 1 — DB 변경 없는 `/p/{pageId}`

### Task 1: URL 생성·파싱 로직 분리 및 단위 테스트

**Files:**

- Create: `lib/selection-route.ts`
- Create: `scripts/selection-route-test.mjs`
- Modify: `components/notion-lite-app.tsx`
- Optional Modify: `package.json` — 반복 실행용 `test:selection-route` 스크립트

**생성 인터페이스:**

```ts
export interface SelectionRoute {
  workspaceId: string
  pageId: string
  kind: 'root' | 'workspace' | 'page' | 'legacy-page' | 'unknown'
}

export function getSelectionPath(workspaceId: string, pageId?: string): string
export function readSelectionFromPath(pathname: string): SelectionRoute
```

경로 생성 규칙:

```txt
workspaceId 없음                 → /
workspaceId만 있음               → /w/{workspaceId}
workspaceId + pageId 있음        → /p/{pageId}
```

파싱 지원 경로:

```txt
/
/w/{workspaceId}
/p/{pageId}
/w/{workspaceId}/p/{pageId}      # legacy-page
```

- [x] `components/notion-lite-app.tsx` 내부의 `getSelectionPath`, `readSelectionFromPath`를 순수 유틸로 옮긴다.
- [x] UUID 형식 자체는 URL 파서에서 제한하지 않고 `decodeURIComponent` 실패만 안전하게 `unknown` 처리한다. 실제 존재 및 권한은 API가 판단한다.
- [x] 한글, 공백, `%`, 잘못된 percent encoding 입력을 테스트한다.
- [x] 페이지가 있으면 워크스페이스 ID를 URL에서 제외하는 생성 규칙을 테스트한다.
- [x] legacy 경로 파싱 결과에 workspace/page ID가 모두 보존되는지 테스트한다.
- [x] 테스트를 먼저 실패시킨 뒤 구현 후 통과시킨다.

**검증:**

```sh
node scripts/selection-route-test.mjs
npm run typecheck
```

**완료 조건:** URL 문자열 처리 로직이 React와 `window` 없이 독립적으로 검증된다.

---

### Task 2: 짧은 페이지 동적 라우트 추가

**Files:**

- Create: `app/p/[pageId]/page.tsx`
- Keep: `app/w/[workspaceId]/page.tsx`
- Keep: `app/w/[workspaceId]/p/[pageId]/page.tsx`

구현 형태:

```tsx
interface PageRouteProps {
  params: Promise<{ pageId: string }>
}

export default async function ShortPageRoute({ params }: PageRouteProps) {
  const { pageId } = await params
  return <NotionLiteApp initialPageId={pageId} />
}
```

- [x] 새 `/p/[pageId]` 라우트를 추가한다.
- [x] 기존 긴 페이지 라우트는 삭제하거나 redirect하지 않는다. 클라이언트 인증이 localStorage 기반이므로 서버 라우트에서 권한 해석을 시도하지 않는다.
- [x] 기존 긴 라우트는 `initialWorkspaceId`와 `initialPageId`를 계속 전달한다.
- [x] Vercel rewrite를 추가하지 않는다. App Router 파일 라우팅만 사용한다.

**검증:**

```sh
curl -I http://10.255.255.254:3000/p/test-page-id
curl -I http://10.255.255.254:3000/w/test-workspace-id/p/test-page-id
```

Expected: 두 경로 모두 HTTP `200`. 페이지 존재·권한 검사는 로그인 후 클라이언트 API에서 수행한다.

---

### Task 3: 페이지 ID → 워크스페이스 해석 흐름 구현

**Files:**

- Modify: `components/notion-lite-app.tsx`
- Reuse: `GET /api/pages?id={pageId}` in `app/api/pages/route.ts`

**핵심 흐름:**

```txt
/p/{pageId} 직접 접속
  → 인증 세션 확인
  → 워크스페이스 목록과 단일 페이지를 조회
  → API가 페이지 멤버십 확인
  → page.workspace_id를 활성 워크스페이스로 설정
  → 요청 페이지를 즉시 화면에 반영
  → 해당 워크스페이스 전체 페이지를 기존 loadPages로 재검증
  → 주소는 /p/{pageId} 유지
```

- [x] `initialPageId && !initialWorkspaceId`를 독립 페이지 경로 요청으로 구분한다.
- [x] 독립 페이지 해석이 끝나기 전에 `loadWorkspaces`가 첫 워크스페이스를 기본 선택하거나 URL을 `/w/...`로 교체하지 않도록 pending gate를 둔다.
- [x] 워크스페이스 목록과 단일 페이지 요청은 가능하면 병렬 실행해 직접 링크 초기 지연을 줄인다.
- [x] 단일 페이지 응답의 `workspace_id`가 사용자의 워크스페이스 목록에 있는지 확인한다. API 권한 검사에 더해 클라이언트 상태 일관성을 확인하는 방어적 검증이다.
- [x] 성공 시 `activeWorkspaceIdRef`, `activePageIdRef`, React state를 한 흐름에서 함께 갱신한다.
- [x] 단일 페이지 응답을 `pages`에 먼저 반영해 문서를 빠르게 표시하되, 전체 워크스페이스 목록 로딩 후 정상 페이지 배열로 reconcile한다.
- [x] `pageFetchedAtRef`를 기록해 직후 동일 페이지 중복 fetch를 줄인다.
- [x] 페이지가 404/403이거나 소속 워크스페이스가 목록에 없으면 내용을 반영하지 않고 접근 가능한 첫 워크스페이스/페이지로 폴백한다.
- [x] 실패 폴백에서는 짧은 잘못된 주소를 정상 선택 주소로 `replaceState`한다.

**가장 위험한 부분:** 독립 페이지 해석과 기존 `loadWorkspaces → activeWorkspaceId → loadPages` effect가 동시에 상태를 갱신하는 경쟁 조건.

**방지책:**

- 독립 페이지 해석 pending ref/state가 true인 동안 기본 워크스페이스 선택 금지
- async 응답 적용 전 현재 요청 page ID 재확인
- 활성 워크스페이스 ref를 state보다 먼저 갱신해 늦은 `loadPages` 응답 가드 유지
- 페이지 해석 완료 후에만 기존 workspace effect가 전체 목록을 로드하도록 순서 보장

**검증 시나리오:**

- [ ] 기본 워크스페이스가 아닌 페이지의 `/p/{pageId}` 직접 접속
- [ ] 첫 워크스페이스 페이지 직접 접속
- [ ] 존재하지 않는 page ID
- [ ] 로그인했지만 멤버가 아닌 워크스페이스 page ID
- [ ] 로그아웃 상태에서 링크 접속 후 로그인
- [ ] API 응답 순서를 인위적으로 늦춰도 기본 선택이 요청 페이지를 덮어쓰지 않음

---

### Task 4: 내부 이동과 History 복원 경로 단축

**Files:**

- Modify: `components/notion-lite-app.tsx`
- Reuse: `lib/selection-route.ts`

- [x] 페이지 선택, 검색 결과 선택, 페이지 생성, 페이지 삭제/롤백 URL을 모두 `/p/{pageId}`로 생성한다.
- [x] 워크스페이스만 선택되고 페이지가 아직 결정되지 않은 순간에는 `/w/{workspaceId}`를 사용한다.
- [x] 기존 긴 URL로 접속해 페이지가 확인되면 `replaceState`로 `/p/{pageId}`로 정규화한다.
- [x] `pushState`/`replaceState`는 계속 기존 `window.history.state`를 보존한다.
- [x] 같은 페이지 경로면 History entry를 중복 추가하지 않는다.
- [x] 현재 `pagesRef`에서 page ID를 찾으면 API 요청 없이 소속 워크스페이스를 결정한다.
- [x] `pagesCache`의 다른 워크스페이스에서 찾으면 해당 워크스페이스를 활성화하고 캐시를 즉시 표시한다.
- [x] 어느 캐시에도 없으면 단일 페이지 API로 해석한다.
- [x] 캐시에 없는 페이지를 빠르게 뒤로/앞으로 이동할 때 이전 API 응답이 최신 경로를 덮어쓰지 않도록 요청 sequence 또는 `AbortController`를 사용한다.
- [x] `popstate` 시점에 `window.location.pathname`과 응답의 page ID가 여전히 일치하는지 적용 직전에 확인한다.

**검증 시나리오:**

- [ ] 같은 워크스페이스의 페이지 A → B → 뒤로 → 앞으로
- [ ] 워크스페이스가 다른 페이지 A → B → 뒤로 → 앞으로
- [ ] 페이지 생성 후 새 짧은 URL
- [ ] 활성 페이지 삭제 후 다음 페이지 짧은 URL
- [ ] 생성 실패 및 삭제 실패 롤백 URL
- [ ] 기존 긴 URL → 짧은 URL 정규화 시 불필요한 화면 전환 없음

---

### Task 5: 회귀 검증 및 개발 이력 갱신

**Files:**

- Modify: `docs/history/DEV_260722.md`
- Optional Modify: `docs/TODO.md` if URL 단축 항목이 존재하거나 추가하기로 결정한 경우

**자동 검증:**

```sh
node scripts/selection-route-test.mjs
npm run typecheck
git diff --check
curl -I http://10.255.255.254:3000/p/test-page-id
curl -I http://10.255.255.254:3000/w/test-workspace-id/p/test-page-id
```

**브라우저 검증:**

- [ ] 로그인 세션에서 페이지 이동 시 앱 셸과 사이드바가 유지된다.
- [ ] URL 복사 후 새 탭 직접 접속이 동작한다.
- [ ] 새로고침 후 같은 페이지가 열린다.
- [ ] 뒤로/앞으로 이동 시 URL, 워크스페이스, 페이지가 모두 일치한다.
- [ ] 모바일 폭에서도 주소 변경에 따른 추가 레이아웃 전환이 없다.
- [ ] 권한 없는 URL에서 페이지 제목이나 본문이 잠시라도 노출되지 않는다.

**완료 조건:** 자동 검증 통과, 주요 브라우저 시나리오 확인, `DEV_260722`에 최종 URL 구조와 호환 정책 기록.

---

## Phase 2 — 선택적 `short_id` 도입

Phase 1 배포 후 UUID 길이가 실제 공유 사용성에 여전히 문제가 될 때만 별도 작업으로 진행한다.

목표 형태:

```txt
/p/K7m2Qa9x
```

예상 작업:

- `pages.short_id TEXT` 컬럼 및 unique index 추가
- 기존 페이지 backfill과 신규 페이지 자동 생성 함수
- 최소 10자리 URL-safe 랜덤 ID 사용
- 충돌 시 재시도 또는 DB 함수 기반 생성
- API가 UUID와 `short_id`를 명확히 구분해 조회
- 기존 `/p/{uuid}`와 긴 legacy URL 영구 호환
- UUID를 `short_id`로 정규화할지 여부 결정

**진행 조건:** Phase 1 이후에도 URL 길이가 사용자 불편으로 확인되거나 외부 공유 링크의 가독성이 제품 요구사항이 될 것.

**별도 계획이 필요한 이유:** DB 마이그레이션, backfill, 충돌 정책, 롤백 전략이 포함되므로 Phase 1과 한 배포에 묶지 않는다.

---

## 단계별 실행 순서

1. Task 1 — URL 순수 로직과 테스트
2. Task 2 — `/p/[pageId]` 직접 접속 라우트
3. Task 3 — 초기 페이지 해석 및 경쟁 조건 차단
4. Task 4 — 내부 이동·History·legacy 정규화
5. Task 5 — 자동/브라우저 검증 및 이력 문서
6. Phase 1 프로덕션 배포 후 사용성 관찰
7. 필요할 때만 Phase 2용 DB 마이그레이션 계획 작성

각 Task가 끝날 때 해당 Task의 검증을 통과시킨 뒤 다음 단계로 진행한다. 전체 구현 중 기존 URL/History 변경사항과 무관한 사용자 작업 파일은 수정하지 않는다.
