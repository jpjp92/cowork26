# Notion Lite 리팩토링 후속 개선 계획

**작성일:** 2026-07-23  
**상태:** 계획 수립  
**대상:** `components/notion-lite-app.tsx`와 `hooks/use-*`, 페이지 트리·URL·저장 흐름

## 목표

리팩토링으로 분리된 모듈의 경계를 자동 테스트로 고정하고, 접힘 상태 문제에서 드러난 부분 데이터·비동기 응답 경쟁 조건을 체계적으로 줄인다. 이후 접근성과 성능을 측정 기반으로 개선해 기능 추가 시 회귀 위험을 낮춘다.

## 현재 기준선

- `components/notion-lite-app.tsx`: 614줄
- 큰 상태 훅: `use-page-data.ts` 350줄, `use-selection-navigation.ts` 215줄, `use-page-persistence.ts` 191줄
- 순수 페이지 트리·이동·URL 테스트는 로컬 스크립트 중심이며 정식 테스트 러너가 없음
- 인증된 핵심 사용자 흐름은 수동 검증 비중이 높음
- page data, persistence, navigation 사이의 일부 연결이 callback ref 계약에 의존함
- 전체 페이지 목록과 URL에서 먼저 받은 단일 페이지처럼 데이터 완성도가 다른 상태가 같은 cache에 들어감

## 핵심 원칙

- 동작을 테스트로 고정한 다음 구조를 변경한다.
- API 계약, DB 스키마, URL 형식은 별도 요구가 없는 한 유지한다.
- 새 전역 상태 라이브러리는 도입하지 않는다.
- 비동기 상태는 최소한 `대상 ID`, `요청 세대`, `준비 상태`를 함께 표현한다.
- 로컬 임시 검증 스크립트는 `scripts/`에 두되 Git에서 제외하고, 지속적으로 유지할 테스트는 `tests/`에 작성한다.
- 성능 최적화는 측정 결과가 있는 구간에만 적용한다.

## 제외 범위

- UI 전면 재디자인
- 오프라인 편집·동기화 시스템 도입
- Supabase 또는 협업 편집 엔진 교체
- API·DB의 대규모 재설계
- 테스트 목적만을 위한 프로덕션 인증 우회

## 우선순위

| 우선순위 | 개선 영역 | 이유 |
|---|---|---|
| P0 | 정식 단위·훅 테스트 기반 | 현재 가장 큰 회귀 방지 공백 |
| P0 | 부분 데이터·비동기 상태 계약 | 접힘 상태와 URL 직접 진입 문제의 근본 영역 |
| P1 | 핵심 브라우저 E2E | 수동 검증 비용과 배포 위험 감소 |
| P1 | callback ref 경계 정리 | 모듈 간 계약을 명시적으로 만들기 위함 |
| P2 | 접근성·키보드 동작 | 트리와 드래그앤드롭의 사용성 보완 |
| P2 | 성능·관측성 | 실제 병목을 확인한 뒤 최적화하기 위함 |

---

## Phase 0 — 기준선과 테스트 정책 고정

### 작업

- [ ] 현재 자동 검사와 인증 브라우저 수동 체크 결과를 기준선으로 기록한다.
- [ ] `tests/`는 커밋되는 회귀 테스트, `scripts/`는 일회성·로컬 검증 도구로 역할을 명시한다.
- [ ] 테스트가 필요한 핵심 불변조건을 목록으로 고정한다.

### 고정할 핵심 불변조건

- 생성 중 페이지는 생성 요청 완료 전 본문 저장 요청을 보내지 않는다.
- 미저장 본문은 background revalidation으로 덮어쓰지 않는다.
- 이전 workspace/page의 늦은 응답은 현재 화면과 저장 상태를 변경하지 않는다.
- `/p/:pageId` 직접 접속 시 단일 페이지 seed와 전체 목록 완료 상태를 구분한다.
- workspace별 페이지 접힘 상태는 서로 섞이거나 빈 배열로 덮이지 않는다.
- 뒤로/앞으로 이동과 legacy URL 변환 결과가 현재 선택 상태와 일치한다.

### 완료 조건

- 자동화 대상과 수동 유지 대상이 구분된 체크리스트가 문서에 남는다.

---

## Phase 1 — 정식 단위·훅 테스트 기반 구축

### 예상 파일

- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/notion-lite/page-tree.test.ts`
- Create: `tests/notion-lite/page-move.test.ts`
- Create: `tests/notion-lite/selection-route.test.ts`
- Create: `tests/notion-lite/use-collapsed-pages.test.tsx`

### 작업

- [ ] Vitest와 jsdom 기반 테스트 환경을 추가한다.
- [ ] 현재 `scripts/*-test.*`의 지속 가치가 있는 순수 로직 테스트를 `tests/notion-lite/`로 이전한다.
- [ ] `useCollapsedPages`에 다음 회귀 테스트를 추가한다.
  - `pagesReady=false`에서는 localStorage를 읽거나 쓰지 않음
  - 전체 목록 준비 후 저장된 접힘 ID 복원
  - workspace 전환 중 이전 workspace의 빈 상태를 저장하지 않음
  - v2 이전의 빈 배열을 최초 1회 기본 접힘으로 복구
  - v2의 의도적인 빈 배열은 그대로 유지
- [ ] `npm run test:unit`과 전체 검증용 `npm run verify` 명령을 추가한다.

### 검증

```sh
npm run test:unit
npm run typecheck
npm run build
git diff --check
```

### 완료 조건

- 순수 로직과 접힘 상태 회귀가 커밋되는 테스트로 재현·검증된다.
- 로컬 테스트 스크립트 없이 CI나 새 개발 환경에서도 같은 검사를 실행할 수 있다.

---

## Phase 2 — 페이지 데이터 완성도와 비동기 상태 명시화

### 대상 파일

- Modify: `hooks/use-page-data.ts`
- Modify: `hooks/use-selection-navigation.ts`
- Modify: `hooks/use-collapsed-pages.ts`
- Modify: `components/notion-lite-app.tsx`
- Create: `tests/notion-lite/use-page-data.test.tsx`
- Create: `tests/notion-lite/use-selection-navigation.test.tsx`

### 작업

- [ ] 페이지 cache 항목에 데이터 출처와 완성도를 명시한다.

```ts
type PageCollectionStatus = 'empty' | 'seeded' | 'ready' | 'refreshing' | 'error'

interface WorkspacePageSnapshot {
  workspaceId: string
  pages: PageRecord[]
  status: PageCollectionStatus
  fetchedAt: number | null
}
```

- [ ] 단일 페이지 URL seed가 전체 목록 준비 상태로 승격되지 않도록 계약을 고정한다.
- [ ] workspace별 목록 요청에 request sequence 또는 `AbortController`를 적용한다.
- [ ] 오래된 요청의 성공·실패·`finally`가 현재 workspace의 loading/error 상태를 변경하지 않게 한다.
- [ ] empty workspace와 아직 불러오지 않은 workspace를 구분한다.
- [ ] optimistic create/delete/move와 background revalidation 병합 규칙을 테스트한다.
- [ ] loading, ready, refreshing, error 전환을 훅 테스트로 검증한다.

### 가장 위험한 지점

optimistic page와 서버 목록을 합치는 과정에서 미저장 content 또는 생성 중 page가 사라질 수 있다. 구조 변경 전 현재 병합 동작을 characterization test로 고정한다.

### 완료 조건

- UI가 `pages.length` 같은 간접 조건이 아니라 명시적인 데이터 상태를 사용한다.
- workspace를 빠르게 연속 전환해도 마지막 선택의 데이터와 상태만 반영된다.

---

## Phase 3 — 훅 간 callback ref 계약 축소

### 대상 파일

- Modify: `components/notion-lite-app.tsx`
- Modify: `hooks/use-page-data.ts`
- Modify: `hooks/use-page-persistence.ts`
- Modify: `hooks/use-selection-navigation.ts`
- Optional Create: `hooks/use-notion-lite-controller.ts`
- Optional Create: `lib/notion-lite/contracts.ts`

### 작업

- [ ] `findPageRef`, `seedResolvedPageRef`, `pageSavedHandlerRef`, `resetSavingStatusRef`의 호출 방향과 책임을 문서화한다.
- [ ] render 중 ref callback을 교체하는 연결을 안정된 command interface 또는 작은 controller hook으로 변경한다.
- [ ] page cache 조회·seed·saved-page 반영을 page data가 소유하도록 모은다.
- [ ] navigation은 page data 내부 구현 대신 필요한 명시적 interface만 받도록 한다.
- [ ] persistence 완료 이벤트가 현재 page 여부와 관계없이 cache를 안전하게 갱신하는지 계약 테스트를 추가한다.
- [ ] 단순히 줄 수를 줄이기 위한 wrapper나 거대 controller hook은 만들지 않는다.

### 검증 시나리오

- 저장 직후 빠른 페이지 전환
- 생성 직후 URL 이동과 본문 입력
- 검색 결과로 다른 workspace의 페이지 열기
- 뒤로가기 중 이전 route resolve 응답 도착
- 로그아웃 시 timer, pending content, cache, request sequence 초기화

### 완료 조건

- 각 ref 연결의 대체 계약이 타입과 테스트로 드러난다.
- `notion-lite-app.tsx`는 기능 간 wiring과 화면 조립 역할만 유지한다.

---

## Phase 4 — 인증된 핵심 브라우저 E2E 구축

### 예상 파일

- Create: `playwright.config.ts`
- Create: `tests/e2e/auth.setup.ts`
- Create: `tests/e2e/notion-lite-navigation.spec.ts`
- Create: `tests/e2e/notion-lite-persistence.spec.ts`
- Create: `tests/e2e/notion-lite-page-tree.spec.ts`
- Modify: `package.json`

### 작업

- [ ] 테스트 전용 Supabase 사용자와 격리된 workspace fixture 전략을 정한다.
- [ ] 인증 정보는 환경변수/CI secret으로만 공급하고 저장소에 넣지 않는다.
- [ ] 테스트별 데이터 생성·정리 정책을 정해 병렬 실행 간 충돌을 방지한다.
- [ ] 다음 핵심 흐름을 자동화한다.
  - 짧은 URL 직접 접속, 새로고침, 뒤로/앞으로
  - 마지막 workspace/page 선택 복원
  - workspace별 페이지 접힘 상태 유지
  - 제목·본문 저장 후 새로고침
  - 생성·하위 생성·삭제·드래그앤드롭
  - 빠른 페이지 전환 중 미저장 본문 보존
- [ ] 실패 시 screenshot, trace, console error를 보존한다.

### 가장 위험한 지점

실시간 협업과 원격 Supabase 상태 때문에 테스트가 불안정해질 수 있다. 고정된 공유 데이터에 의존하지 않고 테스트별 fixture를 생성하며, 임의 timeout 대신 UI와 네트워크 완료 조건을 기다린다.

### 완료 조건

- 현재 수동 1~4번 접힘 상태 확인과 핵심 저장·URL 시나리오를 한 명령으로 재검증할 수 있다.

---

## Phase 5 — 접근성과 상호작용 개선

### 대상 파일

- Modify: `components/notion-lite/page-tree.tsx`
- Modify: `components/notion-lite/workspace-menu.tsx`
- Modify: `components/notion-lite/delete-page-dialog.tsx`
- Modify: `components/notion-lite/settings-panel.tsx`
- Modify: `components/notion-lite/workspace-sidebar.tsx`

### 작업

- [ ] 페이지 트리에 `aria-expanded`, 현재 선택, 계층 관계를 표현한다.
- [ ] 방향키로 트리 이동·접기·펼치기 동작을 제공한다.
- [ ] 드래그앤드롭의 키보드 대체 동작을 설계한다.
- [ ] dialog의 초기 focus, focus trap, Escape, 닫힌 뒤 focus 복원을 검증한다.
- [ ] icon button에 명확한 accessible name과 focus-visible 상태를 확인한다.
- [ ] 좁은 viewport와 확대 배율에서 sidebar, menu, document pane을 확인한다.

### 검증

- Playwright keyboard 시나리오
- axe 기반 주요 화면 자동 검사
- 실제 키보드 수동 확인

### 완료 조건

- 마우스 없이 주요 페이지 탐색과 dialog 조작이 가능하다.
- 핵심 화면에서 심각한 자동 접근성 위반이 없다.

---

## Phase 6 — 성능 측정과 운영 관측성

### 작업

- [ ] 페이지 수가 큰 workspace fixture로 전환·트리 렌더·검색 시간을 측정한다.
- [ ] React Profiler로 page tree와 editor 주변의 불필요한 재렌더를 확인한다.
- [ ] 목록 API와 단일 페이지 API의 cache hit, background refresh, 실패 시간을 개발 로그에서 구분한다.
- [ ] 저장 실패와 route resolve 실패에 page/workspace ID를 노출하지 않는 안전한 진단 context를 추가한다.
- [ ] 측정 결과가 있을 때만 memoization, tree virtualization, cache eviction을 적용한다.

### 성능 개선 후보

- 대규모 페이지 트리의 visible-node 계산 최적화
- 오래 사용한 세션의 workspace page cache 제한 또는 LRU 정책
- workspace 전환 시 중복 목록 요청 병합
- 검색과 tree 계산의 입력 변경 범위 축소

### 완료 조건

- 개선 전후 수치가 기록되고, 적용한 최적화마다 재현 가능한 근거가 있다.

---

## 단계별 공통 검증 게이트

각 Phase 완료 시 아래 검사를 실행한다.

```sh
npm run test:unit
npm run typecheck
npm run build
git diff --check
```

E2E 구축 후에는 다음을 추가한다.

```sh
npm run test:e2e
```

수동 검증이 필요한 단계에서는 최소한 다음을 확인한다.

- workspace/page 이동과 URL
- 새로고침과 마지막 선택 복원
- 접힘 상태의 workspace별 유지
- 제목·본문 저장과 빠른 이동
- 생성·삭제·이동
- 검색에서 다른 workspace 페이지 열기

## 전체 완료 기준

- 핵심 상태 불변조건이 커밋되는 단위·훅 테스트로 보호된다.
- 인증된 핵심 사용자 흐름을 브라우저 E2E로 반복 검증할 수 있다.
- 부분 데이터와 전체 데이터, 이전 요청과 현재 요청이 타입과 상태로 구분된다.
- callback ref 기반 연결이 줄고 모듈 간 계약이 명시적으로 드러난다.
- 주요 페이지 트리와 dialog를 키보드로 사용할 수 있다.
- 성능 개선은 측정 수치와 함께 기록된다.

## 권장 실행 순서

1. Phase 0~1로 테스트 기반부터 구축한다.
2. Phase 2의 page data 상태 명시화를 작은 단위로 진행한다.
3. 확보된 테스트 위에서 Phase 3 callback ref 경계를 정리한다.
4. Phase 4 E2E를 추가해 수동 회귀 확인을 자동화한다.
5. Phase 5 접근성과 Phase 6 성능은 독립 작업으로 진행한다.

첫 구현 작업은 **Phase 1의 Vitest 환경 및 `useCollapsedPages` 회귀 테스트 추가**로 시작한다.
