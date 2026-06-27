# 페이지·워크스페이스 이동 레이턴시 개선 설계

> 작성일: 2026-06-18
> 대상: `components/notion-lite-app.tsx`, `app/api/_utils/auth.ts`

## 1. 배경 / 문제

페이지 및 워크스페이스 이동 시 체감 지연이 발생한다. 사용자가 가장 거슬려 하는 지점:

1. **워크스페이스 전환 시 매번 로딩** — A→B→A 전환할 때마다 스켈레톤이 뜨고 페이지 목록을 처음부터 다시 fetch.
2. **전반적으로 모든 동작이 굼뜸** — 모든 API 요청이 일관되게 약간씩 느림.

### 현재 구조에서의 원인

- **클라이언트**: 단일 클라이언트 컴포넌트(`notion-lite-app.tsx`)가 모든 fetch를 직접 호출. 워크스페이스별 페이지 캐시가 없어 전환마다 `loadPages()`가 해당 워크스페이스의 모든 페이지를 `content` JSON 통째로 재요청.
- **서버 왕복**: 모든 `/api/*` 요청이 `getUserFromRequest`(→ `auth.getUser`, 10초 메모리 캐시 있음) + `requireWorkspaceRole`(→ `workspace_members` 쿼리, **캐시 없음, 매번**) + 실제 데이터 쿼리를 **순차로** 수행 → 요청당 Supabase로 2~3회 왕복. supabase-js는 REST(HTTPS) 기반이라 커넥션 풀 문제가 아니라 **왕복 횟수**가 원인.

규모는 아직 작으므로(워크스페이스당 페이지 수십 개 이하 추정) 페이로드 최적화보다 **체감 캐시 + 왕복 감소**가 우선이다.

## 2. 범위

### 포함 (Tier 1·2)

- **클라이언트**: 워크스페이스별 페이지 stale-while-revalidate(SWR) 캐시.
- **서버**: `requireWorkspaceRole` 결과 메모리 캐시.

### 제외 (Tier 3 — 향후 과제, 본 설계에서 구현하지 않음)

- JWT 로컬 검증(jose)으로 `auth.getUser` 네트워크 왕복 제거 — env(Supabase JWT 시크릿/JWKS) 추가가 필요해 이번 범위에서 제외.
- 사이드바용 메타데이터와 본문 `content` 분리(lazy content fetch) — 페이지 수가 커지면 도입.
- Vercel ↔ Supabase 리전 코로케이션 점검.

## 3. 설계

### 3.1 클라이언트 — 워크스페이스별 페이지 SWR 캐시

**자료구조**

```ts
const pagesCache = useRef(new Map<string, PageRecord[]>())
// key: workspaceId, value: 해당 워크스페이스의 pages (저장된 content만 포함)
```

**워크스페이스 전환 effect** (`activeWorkspaceId` 변경 시, 현재 L459)

```ts
useEffect(() => {
  if (!activeWorkspaceId) { setPages([]); selectActivePage(''); return }

  const cached = pagesCache.current.get(activeWorkspaceId)
  if (cached) {
    // 캐시 히트: 스켈레톤 없이 즉시 표시 + 백그라운드 재검증
    setPages(cached)
    setActivePageId(prev => {
      const next = cached.some(p => p.id === prev) ? prev : cached[0]?.id ?? ''
      activePageIdRef.current = next
      return next
    })
    loadPages(activeWorkspaceId, { background: true })
      .catch(err => setError(...))
  } else {
    // 캐시 미스: 기존처럼 스켈레톤 + fetch
    loadPages(activeWorkspaceId).catch(err => setError(...))
  }
}, [activeWorkspaceId, loadPages, selectActivePage])
```

**캐시 동기화 effect** (핵심 — mutation 호출부를 건드리지 않기 위함)

```ts
useEffect(() => {
  if (!activeWorkspaceId) return
  // workspace_id 가드로 "전환 직후 이전 워크스페이스 pages가 새 id로 저장되는" 레이스 차단.
  // pages는 항상 단일 워크스페이스 소속이라 pages[0]이 대표성을 가짐.
  // 빈 배열은 여기서 캐싱하지 않음(loadPages가 책임) → '미로드' vs '로드 후 빈' 혼동 방지.
  if (pages.length > 0 && pages[0].workspace_id === activeWorkspaceId) {
    pagesCache.current.set(activeWorkspaceId, pages)
  }
}, [pages, activeWorkspaceId])
```

이 effect로 생성/삭제/이동/이름변경/저장 등 모든 `setPages`가 자동으로 캐시에 반영된다. 개별 mutation 호출부 수정 불필요.

**`loadPages(workspaceId, options)` 수정**

```ts
const loadPages = useCallback(async (
  workspaceId: string,
  options?: { background?: boolean },
) => {
  if (!accessToken || !workspaceId) return
  const background = options?.background ?? false
  setError('')
  if (!background) setPagesLoading(true)   // 백그라운드면 스켈레톤 안 켬
  try {
    const response = await fetch(`/api/pages?workspaceId=${workspaceId}`, { headers: authHeaders() })
    if (!response.ok) throw await readError(response, '페이지를 불러오지 못했습니다.')

    const data = await response.json() as PageRecord[]
    const fetchedAt = Date.now()
    for (const page of data) pageFetchedAtRef.current.set(page.id, fetchedAt)

    // --- reconcile: 미저장/저장 중 content 보존 (저장 손실 방지) ---
    const currentById = new Map(pages.map(p => [p.id, p]))
    const reconciled = data.map(serverPage => {
      const hasUnsaved =
        saveTimers.current.has(serverPage.id) ||
        contentSaveInFlight.current.has(serverPage.id) ||
        pendingContent.current.has(serverPage.id)
      if (!hasUnsaved) return serverPage
      // 구조 변경(parent/order/title)은 수용하되 content는 로컬 우선
      const localContent =
        pendingContent.current.get(serverPage.id)
        ?? currentById.get(serverPage.id)?.content
        ?? serverPage.content
      return { ...serverPage, content: localContent }
    })

    // 캐시는 항상 갱신(빈 배열 포함). 키가 workspaceId라 응답 순서와 무관하게 정확.
    pagesCache.current.set(workspaceId, reconciled)

    // 화면 반영은 아직 같은 워크스페이스를 보고 있을 때만(전환 중 늦게 온 응답 무시)
    if (workspaceId === activeWorkspaceIdRef.current) {
      setPages(reconciled)
      setActivePageId(current => {
        const next = reconciled.some(p => p.id === current) ? current : reconciled[0]?.id ?? ''
        activePageIdRef.current = next
        return next
      })
    }
  } finally {
    if (!background) setPagesLoading(false)
  }
}, [accessToken, authHeaders, pages])
```

> 주의: 응답 반영 가드를 위해 `activeWorkspaceId`의 ref(`activeWorkspaceIdRef`)가 필요하다. `activePageIdRef`와 동일 패턴으로 추가한다(상태 변경 시 ref 동기화 effect).

### 3.2 서버 — `requireWorkspaceRole` 결과 캐시 (`app/api/_utils/auth.ts`)

기존 `authUserCache` 패턴을 그대로 복제한다.

```ts
const ROLE_CACHE_TTL_MS = 5_000
const ROLE_CACHE_MAX_SIZE = 200
const roleCache = new Map<string, { role: 'owner' | 'editor' | 'viewer'; expiresAt: number }>()
// key: `${userId}:${workspaceId}`
```

`requireWorkspaceRole`:

1. 캐시 히트(미만료) → 저장된 **role 문자열**을 인자 `roles` 배열과 대조해 boolean 반환.
2. 미스 → 기존 쿼리 수행. 성공 시 role을 캐시에 저장하고 `roles`와 대조.
3. **불리언이 아닌 role 문자열을 캐싱**한다. 엔드포인트마다 허용 `roles`가 달라(owner-only vs owner+editor) 불리언을 캐싱하면 권한 체크가 섞인다.
4. 비멤버(negative) 결과는 캐싱하지 않는다(드물고 Forbidden 처리됨).
5. `pruneAuthUserCache`와 동일한 방식의 prune 함수로 만료/초과 엔트리 정리.

**효과**: 따뜻한 인스턴스에서 같은 토큰 연속 요청 시 role 왕복 제거 → 요청당 왕복 3 → 2회(또는 auth 캐시까지 히트하면 실제 데이터 쿼리 1회만).

## 4. 정합성 분석 (저장/로딩 실패 가능성 점검)

### 닫힌 리스크

- **백그라운드 재검증이 미저장 편집 덮어쓰기** — `loadPages` reconcile 단계(3.1)가 `saveTimers`/`contentSaveInFlight`/`pendingContent` 중 하나라도 있으면 해당 페이지 content를 로컬 우선으로 유지. 단건 재검증 effect(L468)와 동일 원칙. → **저장 손실 방지.**
- **캐시가 미저장 편집을 담아 사라뜨리는 문제** — 표시 content는 `pendingContent ?? pages.content`(L178), 캐시에 들어가는 `pages`엔 저장된 content만 포함. `pendingContent`는 ref라 전환에도 생존. → 미저장분 소실 없음.
- **전환 중 늦게 온 응답** — `setPages`는 `workspaceId === activeWorkspaceIdRef.current`일 때만, 캐시는 `workspaceId` 키로 기록. → 순서 무관 정확.
- **이전 워크스페이스 pages가 새 id로 캐싱되는 레이스** — 동기화 effect의 `pages[0].workspace_id === activeWorkspaceId` 가드로 차단.
- **빈 워크스페이스** — `loadPages`만 `[]`를 캐시(Map.has로 로드 여부 판별), 동기화 effect는 `length>0`만 → 일관.
- **mutation 후 캐시 정합** — 동기화 effect가 모든 `setPages`를 자동 캡처.
- **`refreshWorkspaceData`** — `flushPendingContentSaves()` 선행 후 loadPages → 미저장분 보존.

### 허용 범위 (의도된 트레이드오프)

- **role 캐시 5초 staleness** — 권한 강등/멤버 제거가 최대 5초 늦게 반영. 멤버 제거 라우트가 없고 role 변경이 드물어 허용. 신규 초대 멤버는 캐시 엔트리가 없어 첫 요청부터 정상.
- **복귀 시 활성 페이지 위치** — `activePageId`가 전역 1개라 A→B→A 시 A의 첫 페이지로 이동. **현재도 동일 동작**이므로 회귀 아님. 개선은 범위 밖.
- **in-flight 제목 저장** — 백그라운드 loadPages가 옛 제목으로 덮을 수 있으나 단건 재검증도 현재 content만 가드하므로 기존과 일관. 제목은 작고 저장이 빨라 위험 낮음(server-wins 유지).

## 5. 변경 파일

- `components/notion-lite-app.tsx`
  - `pagesCache` ref 추가
  - `activeWorkspaceIdRef` ref + 동기화 effect 추가
  - 워크스페이스 전환 effect: 캐시 히트 시 즉시 표시 + 백그라운드 재검증
  - 캐시 동기화 effect 추가
  - `loadPages`: `options.background` + reconcile + 응답 반영 가드
- `app/api/_utils/auth.ts`
  - `roleCache` + prune + `requireWorkspaceRole` 캐시 적용

## 6. 검증 방법

- **워크스페이스 전환**: A→B→A 시 두 번째 A 진입에서 스켈레톤이 뜨지 않고 즉시 목록 표시, 네트워크 탭에서 백그라운드 `GET /api/pages?workspaceId=A` 1회.
- **저장 손실 회귀 테스트**: A에서 편집(저장 디바운스 중) → 즉시 B로 갔다가 A로 복귀 → 편집 내용이 유지되는지, 저장 완료 후에도 옛 내용으로 되돌아가지 않는지 확인.
- **role 캐시**: 동일 토큰으로 연속 API 호출 시 `timing` 로그에서 `role.select` 측정이 사라지는지(캐시 히트) 확인.
- `npm run typecheck` 통과.
