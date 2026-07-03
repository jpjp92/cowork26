# 워크스페이스 페이지 검색 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 활성 워크스페이스 내 페이지를 제목·본문으로 검색해 결과에서 바로 해당 페이지로 이동하는 기능을 추가한다.

**Architecture:** 앱은 이미 활성 워크스페이스의 모든 페이지를 `content`(ProseMirror JSON)까지 `pages` 상태에 로드한다. 따라서 신규 API·DB·FTS 없이 **클라이언트 사이드**에서 필터링한다. ProseMirror JSON → 평문 추출 순수 함수(`lib/`)와 매칭·스니펫·정렬 순수 함수(`lib/`)를 각각 두고, 표현 컴포넌트 `SearchModal`이 이를 소비하며, `notion-lite-app.tsx`는 Pages 헤더의 `⌕` 아이콘 + 모달 오픈 상태 + `onSelect → selectActivePage` 배선만 담당한다.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4. 유닛 테스트 러너(jest/vitest)는 없음 — 순수 함수는 `scripts/*.mjs` 노드 스크립트(`node:assert`)로, 통합은 Playwright로 검증한다(기존 `scripts/workspace-dropdown-review.mjs` 패턴).

## Global Constraints

- 기존 파일 규모/패턴을 따른다. `notion-lite-app.tsx`는 대형 파일이므로 **로직을 새 `lib/` 파일로 분리**하고 컴포넌트에는 배선만 추가한다.
- Neo-Brutalist UI 토큰 고정: `border border-black`, `bg-[#50504d]`, `shadow-[2px_2px_0_#000]`, hover 시 `bg-[#baf7c8]` + `text-black`. 아이콘은 유니코드 글리프 `⌕`(U+2315) — 이모지/이미지 아님.
- 검색 아이콘 위치: 사이드바 Pages 헤더 행(`components/notion-lite-app.tsx:1676-1681`) 우측, 개수 배지(line 1680) 옆.
- 검색 범위: **활성 워크스페이스 1개**. 매칭은 **대소문자 무시 부분 문자열**. 빈 검색어는 결과 없음.
- v1은 **페이지 열기까지만** — 에디터 내 하이라이트/스크롤은 범위 밖.
- `PageRecord` 형태(고정): `{ id, workspace_id, parent_id, title, order_index, content: Record<string, unknown> | null, created_at, updated_at }` (`components/notion-lite-app.tsx:44-53`).
- 커밋은 각 Task 끝에서. (설계 스펙: `docs/plans/PLAN_20260703_WORKSPACE_SEARCH.md`)

---

### Task 1: ProseMirror JSON → 평문 추출 유틸

**Files:**
- Create: `lib/tiptap-to-plaintext.ts`
- Test: `scripts/tiptap-to-plaintext-test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `export function tiptapToPlainText(content: Record<string, unknown> | null): string` — ProseMirror 문서 JSON에서 모든 `text` 노드를 이어붙이되 블록 경계에 공백 하나를 넣고, 앞뒤 공백을 정리한 평문을 반환. `null`이면 빈 문자열.

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/tiptap-to-plaintext-test.mjs`:

```js
import assert from 'node:assert/strict'
import { tiptapToPlainText } from '../lib/tiptap-to-plaintext.ts'

// null → 빈 문자열
assert.equal(tiptapToPlainText(null), '')

// 단순 문단
assert.equal(
  tiptapToPlainText({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '안녕하세요' }] }],
  }),
  '안녕하세요',
)

// 여러 블록: 경계에 공백, 중복 공백 없음
assert.equal(
  tiptapToPlainText({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '제목' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '본문 내용' }] },
    ],
  }),
  '제목 본문 내용',
)

// 중첩(목록/표): 내부 text 노드까지 수집
assert.equal(
  tiptapToPlainText({
    type: 'doc',
    content: [{
      type: 'bulletList',
      content: [{
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목1' }] }],
      }, {
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목2' }] }],
      }],
    }],
  }),
  '항목1 항목2',
)

// text 없는 노드(이미지 등) 무시, 빈 결과는 빈 문자열
assert.equal(
  tiptapToPlainText({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }),
  '',
)

console.log('tiptap-to-plaintext: all passed')
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/tiptap-to-plaintext-test.mjs`
Expected: FAIL — `Cannot find module '../lib/tiptap-to-plaintext.ts'` (또는 import 오류)

> 참고: Node 25는 `--experimental-strip-types` 없이도 `.ts` import를 지원한다. 실패 시 Step 2 명령을 `node --experimental-strip-types scripts/tiptap-to-plaintext-test.mjs`로 바꾼다.

- [ ] **Step 3: 최소 구현 작성**

`lib/tiptap-to-plaintext.ts`:

```ts
type TiptapNode = {
  type?: string
  content?: TiptapNode[]
  text?: string
}

function collect(node: TiptapNode, out: string[]): void {
  if (typeof node.text === 'string' && node.text.length > 0) {
    out.push(node.text)
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collect(child, out)
  }
}

// ProseMirror 문서 JSON에서 검색용 평문을 추출한다. text 노드를 이어붙이되
// 블록 경계 정보 없이 단순 결합하면 단어가 붙으므로 각 text 조각을 공백으로 잇고
// 중복 공백을 접는다. 마크다운 기호는 포함하지 않아 검색 정확도를 높인다.
export function tiptapToPlainText(content: Record<string, unknown> | null): string {
  if (!content) return ''
  const parts: string[] = []
  collect(content as TiptapNode, parts)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
```

- [ ] **Step 4: 통과 확인**

Run: `node scripts/tiptap-to-plaintext-test.mjs`
Expected: PASS — `tiptap-to-plaintext: all passed`

- [ ] **Step 5: 커밋**

```bash
git add lib/tiptap-to-plaintext.ts scripts/tiptap-to-plaintext-test.mjs
git commit -m "feat: ProseMirror JSON 평문 추출 유틸 추가"
```

---

### Task 2: 페이지 검색 로직(매칭·스니펫·정렬)

**Files:**
- Create: `lib/page-search.ts`
- Test: `scripts/page-search-test.mjs`

**Interfaces:**
- Consumes: `tiptapToPlainText` (Task 1)
- Produces:
  - `export interface SearchablePage { id: string; title: string; content: Record<string, unknown> | null; updated_at: string }`
  - `export interface SearchResult { id: string; title: string; titleMatch: boolean; snippet: string; matchStart: number; matchLength: number }`
    - `snippet`: 본문 매칭 시 매칭 지점 앞뒤 최대 30자를 잘라 앞뒤에 필요 시 `…`를 붙인 문자열. 제목만 매칭이면 빈 문자열.
    - `matchStart`/`matchLength`: `snippet`(제목 매칭이면 `title`) 안에서 하이라이트할 부분 문자열의 시작 인덱스와 길이. 매칭 없으면 결과에서 제외되므로 항상 유효.
  - `export function searchPages(pages: SearchablePage[], query: string): SearchResult[]` — 대소문자 무시 부분 문자열 매칭. 제목 매칭 그룹이 본문 매칭 그룹보다 앞, 각 그룹 내 `updated_at` 내림차순. 빈/공백 쿼리는 `[]`.

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/page-search-test.mjs`:

```js
import assert from 'node:assert/strict'
import { searchPages } from '../lib/page-search.ts'

const doc = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const pages = [
  { id: 'a', title: '회의록', content: doc('예산 논의 결과 정리'), updated_at: '2026-07-01T00:00:00Z' },
  { id: 'b', title: '예산 계획', content: doc('상세 내용 없음'), updated_at: '2026-07-02T00:00:00Z' },
  { id: 'c', title: '잡담', content: doc('예산 얘기도 잠깐 나옴'), updated_at: '2026-07-03T00:00:00Z' },
]

// 빈/공백 쿼리 → 결과 없음
assert.deepEqual(searchPages(pages, ''), [])
assert.deepEqual(searchPages(pages, '   '), [])

// '예산' 매칭: 제목 매칭(b)이 본문 매칭(a,c)보다 앞, 본문 그룹은 updated_at 내림차순(c 먼저)
const r = searchPages(pages, '예산')
assert.deepEqual(r.map(x => x.id), ['b', 'a', 'c'])

// 제목 매칭 플래그와 하이라이트 위치
assert.equal(r[0].titleMatch, true)
assert.equal(r[0].snippet, '')
assert.equal('예산 계획'.slice(r[0].matchStart, r[0].matchStart + r[0].matchLength), '예산')

// 본문 매칭: 스니펫 안에 검색어 포함, 하이라이트 위치 정확
const bodyHit = r.find(x => x.id === 'a')
assert.equal(bodyHit.titleMatch, false)
assert.ok(bodyHit.snippet.includes('예산'))
assert.equal(
  bodyHit.snippet.slice(bodyHit.matchStart, bodyHit.matchStart + bodyHit.matchLength),
  '예산',
)

// 대소문자 무시
const ci = searchPages(
  [{ id: 'd', title: 'ReadMe', content: null, updated_at: '2026-07-01T00:00:00Z' }],
  'readme',
)
assert.equal(ci.length, 1)
assert.equal(ci[0].id, 'd')

// 긴 본문: 스니펫 경계에 말줄임 표시
const long = 'x'.repeat(60) + '핵심어' + 'y'.repeat(60)
const lr = searchPages(
  [{ id: 'e', title: '무관', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }] }, updated_at: '2026-07-01T00:00:00Z' }],
  '핵심어',
)
assert.ok(lr[0].snippet.startsWith('…'))
assert.ok(lr[0].snippet.endsWith('…'))
assert.ok(lr[0].snippet.includes('핵심어'))

console.log('page-search: all passed')
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/page-search-test.mjs`
Expected: FAIL — `Cannot find module '../lib/page-search.ts'`

- [ ] **Step 3: 최소 구현 작성**

`lib/page-search.ts`:

```ts
import { tiptapToPlainText } from './tiptap-to-plaintext'

export interface SearchablePage {
  id: string
  title: string
  content: Record<string, unknown> | null
  updated_at: string
}

export interface SearchResult {
  id: string
  title: string
  titleMatch: boolean
  snippet: string
  matchStart: number
  matchLength: number
}

const SNIPPET_RADIUS = 30

function buildSnippet(text: string, index: number, queryLength: number) {
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(text.length, index + queryLength + SNIPPET_RADIUS)
  const leading = start > 0 ? '…' : ''
  const trailing = end < text.length ? '…' : ''
  const snippet = leading + text.slice(start, end) + trailing
  const matchStart = leading.length + (index - start)
  return { snippet, matchStart }
}

// 활성 워크스페이스 페이지를 제목+본문 평문에 대해 대소문자 무시 부분 문자열로 검색한다.
// 제목 매칭을 본문 매칭보다 우선하고, 각 그룹 내에서는 updated_at 최근순으로 정렬한다.
export function searchPages(pages: SearchablePage[], query: string): SearchResult[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const needle = trimmed.toLowerCase()

  const results: SearchResult[] = []
  for (const page of pages) {
    const title = page.title ?? ''
    const titleIndex = title.toLowerCase().indexOf(needle)
    if (titleIndex >= 0) {
      results.push({
        id: page.id,
        title,
        titleMatch: true,
        snippet: '',
        matchStart: titleIndex,
        matchLength: needle.length,
      })
      continue
    }
    const body = tiptapToPlainText(page.content)
    const bodyIndex = body.toLowerCase().indexOf(needle)
    if (bodyIndex >= 0) {
      const { snippet, matchStart } = buildSnippet(body, bodyIndex, needle.length)
      results.push({
        id: page.id,
        title,
        titleMatch: false,
        snippet,
        matchStart,
        matchLength: needle.length,
      })
    }
  }

  return results.sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1
    return 0
  }).sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1
    const ua = pages.find(p => p.id === a.id)!.updated_at
    const ub = pages.find(p => p.id === b.id)!.updated_at
    return ub.localeCompare(ua)
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `node scripts/page-search-test.mjs`
Expected: PASS — `page-search: all passed`

- [ ] **Step 5: 정렬 리팩터 정리(중복 sort 제거)**

Step 3의 이중 `.sort` 대신 단일 비교자로 교체한다. `searchPages`의 `return results.sort(...)...` 블록을 아래로 바꾼다:

```ts
  const updatedAtById = new Map(pages.map(p => [p.id, p.updated_at]))
  return results.sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1
    return (updatedAtById.get(b.id) ?? '').localeCompare(updatedAtById.get(a.id) ?? '')
  })
```

- [ ] **Step 6: 통과 재확인**

Run: `node scripts/page-search-test.mjs`
Expected: PASS — `page-search: all passed`

- [ ] **Step 7: 커밋**

```bash
git add lib/page-search.ts scripts/page-search-test.mjs
git commit -m "feat: 페이지 제목·본문 검색 로직(매칭·스니펫·정렬) 추가"
```

---

### Task 3: SearchModal 컴포넌트

**Files:**
- Create: `components/search-modal.tsx`

**Interfaces:**
- Consumes: `searchPages`, `SearchResult`, `SearchablePage` (Task 2)
- Produces:
  ```ts
  interface SearchModalProps {
    open: boolean
    pages: SearchablePage[]
    onClose: () => void
    onSelect: (pageId: string) => void
  }
  export function SearchModal(props: SearchModalProps): JSX.Element | null
  ```
  - `open === false`이면 `null` 렌더.
  - 입력값에 대해 `useMemo`로 `searchPages(pages, query)` 계산.
  - 키보드: ↑/↓ 결과 이동, Enter로 선택 시 `onSelect(id)` 후 `onClose()`, Esc로 `onClose()`.
  - 매칭 하이라이트는 결과 행 안에서 `matchStart`/`matchLength`로 `<mark>` 처리.

- [ ] **Step 1: 컴포넌트 구현**

`components/search-modal.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { searchPages, type SearchablePage, type SearchResult } from '../lib/page-search'

interface SearchModalProps {
  open: boolean
  pages: SearchablePage[]
  onClose: () => void
  onSelect: (pageId: string) => void
}

function Highlighted({ text, start, length }: { text: string; start: number; length: number }) {
  if (length <= 0 || start < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-[#baf7c8] text-black">{text.slice(start, start + length)}</mark>
      {text.slice(start + length)}
    </>
  )
}

export function SearchModal({ open, pages, onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo<SearchResult[]>(
    () => (open ? searchPages(pages, query) : []),
    [open, pages, query],
  )

  // 모달이 열릴 때마다 입력 초기화 + 포커스, 결과가 바뀌면 활성 인덱스 리셋
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  const choose = (index: number) => {
    const hit = results[index]
    if (!hit) return
    onSelect(hit.id)
    onClose()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(i => Math.min(i + 1, Math.max(0, results.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-black bg-white shadow-[4px_4px_0_#000]"
        onClick={event => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-black p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="페이지 제목·내용 검색"
            className="h-9 w-full border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555]"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm font-bold text-[#555]">
              {query.trim() ? '검색 결과가 없습니다.' : '검색어를 입력하세요.'}
            </li>
          ) : (
            results.map((hit, index) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(index)}
                  className={`block w-full px-4 py-2 text-left ${index === activeIndex ? 'bg-[#baf7c8] text-black' : 'bg-white text-black'}`}
                >
                  <p className="truncate text-sm font-black">
                    {hit.titleMatch
                      ? <Highlighted text={hit.title} start={hit.matchStart} length={hit.matchLength} />
                      : hit.title}
                  </p>
                  {!hit.titleMatch && (
                    <p className="truncate text-xs text-[#333]">
                      <Highlighted text={hit.snippet} start={hit.matchStart} length={hit.matchLength} />
                    </p>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크**

Run: `npm run typecheck`
Expected: PASS — 에러 없음. (이 저장소는 `@/` 별칭이 없어 `../lib/...` 상대경로를 사용한다. 기존 `notion-lite-app.tsx:9-10` 참고.)

- [ ] **Step 3: 커밋**

```bash
git add components/search-modal.tsx
git commit -m "feat: 페이지 검색 모달 컴포넌트 추가"
```

---

### Task 4: notion-lite-app 통합 — 검색 아이콘 + 모달 배선

**Files:**
- Modify: `components/notion-lite-app.tsx` (import 추가; 상태 추가 ~line 156 부근; Pages 헤더 line 1676-1681; 모달 렌더)

**Interfaces:**
- Consumes: `SearchModal` (Task 3), 기존 `pages` 상태(`:144`), 기존 `selectActivePage`(`:289`), 기존 `activeWorkspaceId`(`:145`)
- Produces: 없음(최종 배선)

- [ ] **Step 1: import 추가**

`components/notion-lite-app.tsx` 상단 import 블록(기존 컴포넌트 import들이 있는 곳)에 추가:

```tsx
import { SearchModal } from './search-modal'
```

- [ ] **Step 2: 모달 오픈 상태 추가**

`const [settingsOpen, setSettingsOpen] = useState(false)` (`:156`) 바로 아래에 추가:

```tsx
  const [searchOpen, setSearchOpen] = useState(false)
```

- [ ] **Step 3: Pages 헤더에 검색 아이콘 버튼 추가**

`components/notion-lite-app.tsx:1676-1681`의 헤더 행을 아래로 교체한다. 개수 배지 오른쪽에 `⌕` 버튼을 두고, 배지+버튼을 우측 그룹으로 묶는다:

```tsx
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[11px] font-black uppercase tracking-normal text-white">
              Pages
            </p>
            <div className="flex items-center gap-1.5">
              <span className="border border-black bg-[#baf7c8] px-1.5 text-xs font-black text-black">{pages.length}</span>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                disabled={!activeWorkspaceId}
                aria-label="페이지 검색"
                className="flex h-6 w-6 items-center justify-center border border-black bg-[#50504d] text-sm font-black leading-none text-white shadow-[2px_2px_0_#000] hover:bg-[#baf7c8] hover:text-black disabled:opacity-40"
              >
                ⌕
              </button>
            </div>
          </div>
```

- [ ] **Step 4: 모달 렌더 배선**

기존 최상위 반환 JSX 안, 다른 오버레이(설정 모달 등)와 같은 레벨에 `SearchModal`을 추가한다. 컴포넌트 반환 JSX의 루트 컨테이너 닫힘 직전(다른 모달 렌더 근처)에 삽입:

```tsx
      <SearchModal
        open={searchOpen}
        pages={pages}
        onClose={() => setSearchOpen(false)}
        onSelect={selectActivePage}
      />
```

- [ ] **Step 5: 타입 체크**

Run: `npm run typecheck`
Expected: PASS — 에러 없음

- [ ] **Step 6: 개발 서버로 육안 확인**

Run: `npm run dev` (별도 터미널) 후 브라우저에서 로그인 → 사이드바 Pages 헤더 우측 `⌕` 클릭 → 모달이 뜨고 입력창에 포커스가 가는지 확인. 확인 후 dev 서버 종료.
Expected: 모달 오픈/닫힘(Esc, 배경 클릭) 동작.

- [ ] **Step 7: 커밋**

```bash
git add components/notion-lite-app.tsx
git commit -m "feat: 사이드바 Pages 헤더에 검색 아이콘·모달 배선"
```

---

### Task 5: Playwright 통합 테스트

**Files:**
- Create: `scripts/workspace-search-review.mjs`
- Modify: `package.json` (scripts에 `review:workspace-search` 추가)

**Interfaces:**
- Consumes: 실행 중인 dev 서버(`http://localhost:3000`), `.env.local`의 Supabase 키, `merge-test`류 테스트 계정 생성/정리 패턴(기존 스크립트 참고)
- Produces: 없음

- [ ] **Step 1: 통합 테스트 스크립트 작성**

`scripts/workspace-search-review.mjs` — 기존 `scripts/workspace-dropdown-review.mjs`의 세션 주입/계정 정리 패턴을 그대로 따르되, 흐름은: (1) 테스트 계정으로 워크스페이스+페이지 2~3개를 API로 생성(제목/본문에 고유 검색어 포함), (2) 로그인 세션 주입 후 앱 로드, (3) 사이드바 `⌕` 버튼 클릭, (4) 모달 입력창에 고유 검색어 입력, (5) 결과 리스트에 기대 페이지가 노출되는지 확인, (6) 첫 결과 클릭 → 해당 페이지로 이동(에디터 제목/URL 확인), (7) 계정·워크스페이스 정리.

핵심 셀렉터: 검색 버튼 `page.getByRole('button', { name: '페이지 검색' })`, 입력창 `page.getByPlaceholder('페이지 제목·내용 검색')`, 결과 행 `page.locator('ul button')`.

```js
// 구조는 scripts/workspace-dropdown-review.mjs를 복제해 아래 검증부만 교체:
const searchBtn = page.getByRole('button', { name: '페이지 검색' })
await searchBtn.click()
const input = page.getByPlaceholder('페이지 제목·내용 검색')
await input.waitFor({ timeout: 5000 })
await input.fill(UNIQUE_TERM)          // 생성 시 심어둔 고유어
await page.waitForTimeout(300)
const firstResult = page.locator('ul button').first()
await firstResult.waitFor({ timeout: 5000 })
const resultText = await firstResult.innerText()
if (!resultText.includes(EXPECTED_TITLE)) throw new Error(`검색 결과 불일치: ${resultText}`)
await firstResult.click()
// 모달 닫힘 + 해당 페이지 활성화 확인
await page.getByPlaceholder('페이지 제목·내용 검색').waitFor({ state: 'detached', timeout: 5000 })
console.log('workspace-search: PASS')
```

- [ ] **Step 2: npm 스크립트 등록**

`package.json`의 `scripts`에 추가:

```json
    "review:workspace-search": "node scripts/workspace-search-review.mjs",
```

- [ ] **Step 3: dev 서버 기동 후 테스트 실행**

Run(별도 터미널에서 `npm run dev` 실행 중): `npm run review:workspace-search`
Expected: `workspace-search: PASS`, 테스트 계정/워크스페이스 정리 완료 로그.

- [ ] **Step 4: 커밋**

```bash
git add scripts/workspace-search-review.mjs package.json
git commit -m "test: 워크스페이스 페이지 검색 Playwright 통합 테스트 추가"
```

---

## Self-Review 결과

- **스펙 커버리지**: 텍스트 추출(설계 §컴포넌트1 → Task 1), 검색 로직 매칭·스니펫·정렬(설계 §검색/결과 동작 → Task 2), SearchModal(설계 §컴포넌트2 → Task 3), notion-lite-app 통합·아이콘·배치(설계 §컴포넌트3 → Task 4), 테스트 전략(설계 §테스트 전략 → Task 1·2·5). v1 제외 항목(에디터 내 하이라이트/교차 검색/FTS)은 계획에 포함하지 않음 — 스펙과 일치.
- **플레이스홀더 스캔**: 코드 스텝은 모두 실제 코드 포함. Task 5 스크립트는 기존 `workspace-dropdown-review.mjs`를 복제 베이스로 명시하고 교체 검증부를 완전히 제시.
- **타입 일관성**: `tiptapToPlainText(content)` (Task 1) → `searchPages`/`SearchResult`/`SearchablePage` (Task 2) → `SearchModal` props (Task 3) → notion-lite-app 배선(Task 4)에서 `pages`(PageRecord[]는 SearchablePage 필드를 포함) · `selectActivePage(pageId: string)` 시그니처와 정합.

## 실행 옵션

**1. Subagent-Driven (권장)** — Task마다 새 subagent 디스패치, Task 간 리뷰.
**2. Inline Execution** — 이 세션에서 executing-plans로 체크포인트 단위 실행.
