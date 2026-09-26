# 노션형 편집 인터랙션 및 표 UI 계획

**작성일:** 2026-09-26  
**상태:** 1차 기능 구현 · 고급 편집 기능 후속  
**대상:** 페이지 트리 컨텍스트 메뉴, 에디터 선택 툴바, 블록 메뉴·드래그, 표 생성·편집

## 결론

페이지와 문서 블록의 기능 진입점을 노션처럼 문맥에 따라 제공한다. 하나의 작업 정의를 우클릭, `⋯` 버튼, 블록 핸들, 모바일 바텀시트가 공유하도록 만들고, 데스크톱과 모바일에서 서로 다른 메뉴 로직이 생기지 않게 한다.

구현 순서는 페이지 트리 공통 메뉴 → 텍스트 선택 툴바 → 표 생성·편집 메뉴 → 블록 핸들·드래그 순으로 진행한다. 표는 이미 Tiptap extension, 외부 표 붙여넣기, 열/행 크기 조절 기반이 있으므로 새 표 엔진을 만들지 않고 기존 editor command를 UI에 연결한다.

## 목표

- 페이지 우클릭, `⋯`, 모바일 탭에서 동일한 작업 메뉴를 제공한다.
- 선택한 텍스트에 필요한 서식 도구만 가까운 위치에 표시한다.
- 빈 문단 또는 블록 추가 메뉴에서 표를 쉽게 생성할 수 있다.
- 표 선택 시 행·열·셀 관련 작업을 발견 가능한 UI로 제공한다.
- 블록 메뉴와 drag handle을 제공하되 모바일에는 명시적 이동 버튼도 제공한다.
- 브라우저 기본 복사·붙여넣기와 맞춤법 검사 기능을 불필요하게 차단하지 않는다.
- 모든 변경이 기존 autosave와 Tiptap JSON 형식을 그대로 사용한다.

## 제외 범위

- Notion 데이터 형식 또는 Notion API 호환
- 데이터베이스형 표의 필터·정렬·수식·관계 기능
- 여러 사용자의 실시간 drag preview
- 모바일에서 데스크톱 수준의 자유로운 drag-and-drop 강제
- 에디터 프레임워크 교체

## 현재 기반

- `components/document-editor.tsx`에서 Tiptap Table, TableRow, TableHeader, TableCell을 사용한다.
- 표 붙여넣기, Markdown 표 변환, 열 너비 조절과 사용자 정의 행 높이 조절이 이미 구현되어 있다.
- `app/globals.css`에는 table wrapper 가로 스크롤, 선택 셀, resize handle 스타일이 있다.
- 페이지 트리는 데스크톱 native drag-and-drop과 우클릭·`⋯` 공통 작업 메뉴를 사용한다.
- `/table`·`/표` 표 생성 메뉴, 표 문맥 메뉴, 선택 텍스트의 3단계 글자 크기 BubbleMenu가 구현됐다. 나머지 텍스트 서식, 범용 slash menu와 블록 메뉴는 아직 없다.

## 1차 구현 현황

- [x] 페이지 행 우클릭과 `⋯` 버튼이 동일한 공통 context menu를 사용한다.
- [x] 모바일에서는 같은 메뉴가 화면 하단 sheet 형태로 표시된다.
- [x] 페이지 열기, 하위 페이지 추가, Markdown 다운로드, 삭제를 공통 메뉴에서 제공한다.
- [x] `/table` 또는 `/표` 입력 시 고정된 작은 `표 만들기` 버튼을 표시하고, 펼친 뒤 2×2, 3×3, 4×4 표를 선택해 생성한다. 상단 고정 툴바는 사용하지 않는다.
- [x] 표 내부 선택 시 표 전체에 고정된 작은 `표 옵션` 버튼을 표시한다. 펼친 메뉴는 세로형·내부 스크롤 구조로 행·열 추가 및 삭제, header 전환, 셀 병합·분할, 표 삭제를 제공한다.
- [x] 표 wrapper를 문서 폭 안에 제한하고 넓은 표만 내부에서 가로 스크롤되게 해 사이드바 침범을 방지한다.
- [x] 일반 본문과 표 셀에서 선택한 텍스트에 `작게(13px) / 기본 / 크게(20px)`를 적용하는 공통 BubbleMenu를 제공한다.
- [ ] 블록 `+` 메뉴와 1×1~8×8 grid 크기 선택기는 전체 slash menu와 함께 확장한다.
- [ ] 페이지 이름 변경·복제·이동을 공통 메뉴에 연결한다.
- [ ] 공통 메뉴의 방향키 roving focus와 trigger focus 복귀를 완성한다.
- [ ] 굵게·기울임·링크 등을 포함한 전체 텍스트 BubbleMenu, slash menu, 블록 handle·drag를 구현한다. 글자 크기 1차 기능은 완료됐다.

---

## Phase 1 — 공통 메뉴 기반 (P0)

### 1.1 메뉴 모델과 표시 컴포넌트

**대상 파일**

- Create: `components/notion-lite/context-menu.tsx`
- Create: `hooks/use-context-menu.ts`
- Modify: `components/notion-lite/page-tree.tsx`

**작업**

- [ ] 메뉴 항목을 `id`, label, icon, shortcut, disabled, destructive, handler로 표현한다.
- [ ] 같은 항목 배열을 우클릭, `⋯`, 키보드 메뉴 키에서 재사용한다.
- [x] viewport 가장자리에서 메뉴가 잘리지 않도록 좌표를 보정한다.
- [ ] 메뉴를 열 때 첫 항목으로 포커스를 옮기고 위/아래·Home/End·Enter·Escape를 지원한다. 첫 항목 포커스와 Escape는 구현됐고 roving focus는 후속이다.
- [x] 바깥 클릭, scroll, resize, 대상 삭제 시 메뉴를 닫는다.
- [ ] trigger로 포커스를 복귀한다.
- [x] 모바일에서는 같은 메뉴 모델을 bottom sheet 표현으로 렌더링한다.

**완료 조건:** 메뉴 내용과 권한 판단을 복제하지 않고 pointer, keyboard, mobile trigger가 동일한 작업을 실행한다.

### 1.2 페이지 트리 컨텍스트 메뉴

**메뉴 항목**

- 페이지 열기
- 이름 변경
- 하위 페이지 추가
- 복제
- 이동
- 마크다운 다운로드
- 삭제

**작업**

- [x] 페이지 행의 우클릭에서 `preventDefault()` 후 커스텀 메뉴를 연다.
- [x] 기존 모바일 `⋯` 메뉴를 공통 메뉴 컴포넌트로 교체한다.
- [x] viewer에게 수정·삭제 항목을 숨긴다. 이동 기능은 아직 구현 전이다.
- [ ] 이름 변경은 행 내부 input 또는 작은 dialog 중 하나로 통일한다.
- [x] 삭제는 기존 확인 dialog를 계속 사용한다.
- [ ] 이동은 최상위와 허용 가능한 다른 페이지를 선택할 수 있게 한다.
- [ ] 자기 자신과 자신의 자손은 이동 대상으로 표시하지 않는다.
- [ ] 복제 시 title·content를 복사하되 asset 복제 정책을 별도로 확인한다.

**주의:** 에디터 본문 전체의 기본 우클릭은 막지 않는다. 커스텀 우클릭은 페이지 행이나 명시적인 블록 핸들처럼 범위가 분명한 요소에만 적용한다.

---

## Phase 2 — 텍스트 선택 및 블록 추가 UI (P1)

### 2.1 텍스트 선택 BubbleMenu

**대상 파일**

- Modify: `components/document-editor.tsx`
- Create: `components/editor/text-bubble-menu.tsx` (분리 시)

**초기 기능**

- 굵게
- 기울임
- 취소선
- 인라인 코드
- 링크 추가·수정·해제
- 일반 문단·제목·목록 변환

**작업**

- [x] Tiptap BubbleMenu를 사용해 비어 있지 않은 텍스트 선택에만 표시한다. 현재 글자 크기 기능부터 적용했다.
- [ ] 코드 블록, 표 다중 셀 선택, 이미지 선택에서는 표시하지 않는다.
- [x] 글자 크기의 활성 mark를 `aria-pressed` 및 시각 상태로 표시한다. 다른 mark와 block type은 후속이다.
- [x] 글자 크기 툴바 클릭 시 editor selection을 잃지 않게 한다.
- [ ] 모바일 키보드와 화면 가장자리에서 메뉴 위치를 보정한다.
- [ ] 링크 URL의 scheme 검증과 `noopener noreferrer` 정책을 유지한다.

### 2.2 블록 추가 메뉴

**진입점**

- 빈 문단의 `/` 슬래시 명령
- 블록 왼쪽 `+` 버튼
- 모바일 편집 툴바의 추가 버튼

**초기 블록 목록**

- 일반 텍스트
- 제목 1·2·3
- 글머리·번호·체크 목록
- 인용문
- 코드 블록
- Mermaid 다이어그램
- 표
- 이미지

**작업**

- [ ] `/` 입력 후 query 기반으로 항목을 필터링한다.
- [ ] 위/아래·Enter·Escape 키와 pointer 선택을 지원한다.
- [ ] 메뉴가 열렸을 때 입력한 `/query`를 선택된 블록 명령으로 치환한다.
- [ ] 한글 IME 조합 중에는 명령을 조기 실행하지 않는다.
- [ ] 표 선택 시 바로 기본 표를 넣지 않고 크기 선택 UI로 연결한다.

---

## Phase 3 — 표 생성과 표 작업 메뉴 (P0/P1)

### 3.1 표 생성 UI

**대상 파일**

- Modify: `components/document-editor.tsx`
- Create: `components/editor/table-size-picker.tsx`
- Modify: `app/globals.css`

**작업**

- [ ] 블록 추가 메뉴의 `표`에서 크기 선택 grid를 연다.
- [ ] pointer hover 또는 keyboard로 행×열을 선택한다.
- [ ] 초기 선택 범위는 최대 8×8, 기본 추천은 3×3으로 한다.
- [x] 1차 구현에서 2×2, 3×3, 4×4 선택 후 `editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()`을 호출한다.
- [ ] 키보드 사용자는 행·열 숫자를 직접 입력할 수 있게 한다.
- [ ] 모바일에서는 간단한 2개 select 또는 stepper와 `표 만들기` 버튼을 제공한다.
- [ ] 표 생성 직후 첫 번째 본문 셀에 selection을 둔다.

**완료 조건:** mouse, keyboard, touch로 표 크기를 선택해 생성할 수 있고 생성 직후 바로 입력할 수 있다.

### 3.2 표 컨텍스트 메뉴

**초기 기능**

- 위·아래 행 추가
- 왼쪽·오른쪽 열 추가
- 현재 행 삭제
- 현재 열 삭제
- 첫 행 header 전환
- 셀 병합·분할
- 열 너비 초기화
- 표 전체 삭제

**Tiptap command 연결 후보**

- `addRowBefore`, `addRowAfter`
- `addColumnBefore`, `addColumnAfter`
- `deleteRow`, `deleteColumn`, `deleteTable`
- `toggleHeaderRow`
- `mergeCells`, `splitCell`
- `setCellAttribute` 또는 별도 width reset transaction

**작업**

- [x] selection이 표 내부에 있을 때만 표 메뉴 trigger를 표시하고, 선택 셀이 아니라 표 전체를 기준으로 위치를 고정한다.
- [x] merge/split처럼 현재 selection에서 실행할 수 없는 명령은 `can()` 결과로 disabled 처리한다.
- [x] destructive 항목을 다른 항목과 시각적으로 분리한다.
- [ ] 행·열 변경 뒤 유효한 셀로 selection을 복구한다.
- [ ] 모바일에서는 작은 셀 handle 대신 하단 `표 편집` 버튼과 bottom sheet를 사용한다.
- [x] 표가 viewport보다 넓으면 wrapper 내부에서만 가로 스크롤하고 문서·사이드바 폭에는 영향을 주지 않게 한다.

### 3.3 표 크기 조절 보완

- [ ] 기존 열 너비 조절과 행 높이 조절이 표 메뉴 overlay와 충돌하지 않는지 확인한다.
- [ ] coarse pointer에서는 3px resize handle 대신 더 넓은 hit area를 제공한다.
- [ ] 모바일 drag resize가 불안정하면 행 높이·열 너비를 `작게/보통/크게/초기화` 명령으로 제공한다.
- [ ] 최소 셀 너비 72px과 최대 행 높이 160px 정책을 UI에 반영한다.
- [ ] resize 중 autosave가 과도하게 발생하지 않도록 pointerup 시점 저장 또는 debounce를 검토한다.

---

## Phase 4 — 블록 핸들 및 이동 (P1)

### 4.1 블록 핸들

**대상 파일**

- Modify: `components/document-editor.tsx`
- Create: `components/editor/block-handle.tsx`
- Create: editor extension/plugin for active block tracking

**작업**

- [ ] 현재 pointer가 위치한 최상위 block의 좌표와 document position을 계산한다.
- [ ] 데스크톱 hover 시 왼쪽에 `+`와 `⠿` 핸들을 표시한다.
- [ ] 핸들 클릭 시 해당 block을 선택하고 block context menu를 연다.
- [ ] heading, paragraph, list, code, table, image, Mermaid 등 node별 지원 항목을 구분한다.
- [ ] read-only viewer에게 핸들을 표시하지 않는다.
- [ ] 좁은 모바일 화면에서는 본문 왼쪽 공간을 차지하지 않도록 선택 기반 toolbar로 전환한다.

### 4.2 블록 메뉴

**초기 기능**

- 블록 타입 변환
- 위로 이동
- 아래로 이동
- 복제
- 블록 내용 복사
- 삭제

**후속 기능**

- anchor 기반 블록 링크 복사
- 배경색·글자색
- 여러 블록 일괄 작업

### 4.3 블록 drag-and-drop

- [ ] drag는 `⠿` 핸들에서만 시작되도록 한다.
- [ ] drop 위치를 block 위·아래 indicator로 표시한다.
- [ ] table/list 내부 node와 최상위 block 이동 규칙을 분리한다.
- [ ] drag 취소 시 document selection과 autosave 상태를 복원한다.
- [ ] 키보드와 모바일에서는 위·아래 이동 명령을 동등한 대체 수단으로 제공한다.
- [ ] 협업 기능 활성화 전에는 현재 문서 state 기준 이동임을 전제로 하고 충돌 테스트를 추가한다.

**완료 조건:** 데스크톱에서는 handle drag, 키보드와 모바일에서는 명시적 이동 명령으로 같은 결과를 만들 수 있다.

---

## 상태 및 접근성 규칙

- 메뉴는 `role="menu"`, 항목은 `role="menuitem"`을 사용하고 roving focus를 구현한다.
- 단순 서식 toggle toolbar는 menu가 아닌 toolbar semantics와 `aria-pressed`를 사용한다.
- 메뉴를 연 trigger에는 `aria-haspopup`, `aria-expanded`, `aria-controls`를 연결한다.
- disabled 기능은 숨길지 비활성화할지 일관된 규칙을 정한다. 권한이 없는 작업은 숨기고, selection 조건이 부족한 작업은 disabled 처리한다.
- Escape는 가장 위에 열린 메뉴만 닫으며 editor selection은 보존한다.
- 모바일 long press는 브라우저 기본 선택 메뉴와 충돌하므로 필수 진입점으로 사용하지 않는다.
- hover는 보조 진입점이며 모든 작업은 click/tap/keyboard로 접근 가능해야 한다.
- `prefers-reduced-motion`에서 메뉴·indicator animation을 축소한다.

## 구현 구조 제안

```text
공통 command/action 정의
├─ 페이지 행 우클릭
├─ 페이지 ⋯ 버튼
├─ 모바일 페이지 bottom sheet
├─ 블록 ⠿ 핸들
└─ 모바일 블록 작업 sheet

Tiptap editor state
├─ 텍스트 선택 → BubbleMenu
├─ 빈 블록 → Slash/Add menu
├─ 표 내부 selection → Table menu
└─ block selection → Block menu / drag handle
```

## 테스트 계획

### 페이지 메뉴

- [ ] 우클릭과 `⋯`가 동일 항목을 표시한다.
- [ ] viewer에게 mutation 항목이 노출되지 않는다.
- [ ] 메뉴 keyboard navigation과 focus 복귀가 동작한다.
- [ ] 메뉴가 viewport 밖으로 나가지 않는다.
- [ ] 이동 대상에서 자기 자신과 자손이 제외된다.

### 선택·블록 메뉴

- [ ] 텍스트 선택 범위가 유지된 채 mark가 적용된다.
- [ ] 빈 선택, code block, table cell selection에서 올바른 메뉴만 표시된다.
- [ ] IME 입력 중 slash menu가 오작동하지 않는다.
- [ ] block 복제·삭제·이동 후 Tiptap JSON과 autosave가 정상 갱신된다.
- [ ] 기본 본문 우클릭과 복사·붙여넣기가 유지된다.

### 표

- [ ] 1×1, 기본 3×3, 최대 8×8 표를 생성한다.
- [ ] 행·열 추가 및 삭제 후 selection이 유효하다.
- [ ] 병합 가능한 selection과 불가능한 selection의 disabled 상태가 정확하다.
- [ ] 표 삭제와 undo/redo가 동작한다.
- [ ] Excel/Google Sheets/Markdown 표 붙여넣기 회귀가 없다.
- [ ] 열 너비·행 높이 조절과 autosave가 정상 동작한다.
- [ ] 320px viewport에서 표만 가로 스크롤되고 문서 전체는 넘치지 않는다.

### 기본 검증 명령

```sh
npm run typecheck
npm run test:editor-paste-priority
npm run test:image-assets
npm run build
```

필요하면 editor command와 메뉴 visibility를 순수 함수로 분리해 unit test를 추가하고, 실제 pointer·keyboard·touch 흐름은 Playwright viewport 테스트로 검증한다.

## 권장 구현 순서

1. 공통 context menu와 page action 모델을 만든다.
2. 기존 페이지 모바일 `⋯` 메뉴를 공통 모델로 교체하고 우클릭을 연결한다.
3. 이름 변경·복제·이동 기능을 완성한다.
4. 텍스트 selection BubbleMenu를 추가한다.
5. slash/add menu와 표 크기 선택기를 추가한다.
6. 표 행·열·셀 작업 메뉴를 연결한다.
7. 블록 handle과 click menu를 추가한다.
8. 데스크톱 block drag와 모바일/키보드 이동 대체 수단을 구현한다.
9. 접근성 및 모바일 viewport 회귀 테스트를 추가한다.

## 가장 위험한 적용 지점

Tiptap 메뉴 버튼을 누르는 순간 editor가 blur되면서 selection이 사라지면 서식·표 명령이 엉뚱한 위치에 실행될 수 있다. 메뉴 pointerdown에서 selection을 보존하고, command 실행 전에 editor focus를 복구하는 동작을 우선 테스트해야 한다.

블록 drag는 list item, table, image 같은 서로 다른 node depth를 동일하게 다루면 문서 구조를 깨뜨릴 수 있다. 1차 구현은 최상위 block 이동으로 범위를 제한하고, list/table 내부 재배치는 각 extension의 정식 command를 사용한다.

## 배포 완료 기준

- [ ] 페이지 메뉴가 우클릭·`⋯`·모바일에서 동일한 권한과 동작을 사용한다.
- [ ] 일반 본문의 브라우저 기본 우클릭과 클립보드 기능이 유지된다.
- [ ] 텍스트 선택 서식과 표 생성·편집을 mouse, keyboard, touch로 수행할 수 있다.
- [ ] 모바일에서 native drag 없이 페이지·블록 이동이 가능하다.
- [ ] 표와 메뉴가 320px 화면에서 문서 전체 가로 넘침을 만들지 않는다.
- [ ] selection 보존, undo/redo, autosave, paste 회귀 테스트가 통과한다.
- [ ] typecheck, 관련 테스트, production build가 통과한다.
