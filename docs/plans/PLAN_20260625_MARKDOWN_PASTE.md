# PLAN_20260625_MARKDOWN_PASTE

## 주제

복합 Markdown 붙여넣기 처리 개선.

## 배경

현재 `components/document-editor.tsx`의 붙여넣기 처리는 단일 규칙 우선순위 방식이다.

```txt
이미지
  -> 내부 이미지
  -> 마크다운 테이블
  -> 코드 블록 / Mermaid
  -> 마크다운 링크
  -> 기본 Tiptap 붙여넣기
```

이 구조에서는 붙여넣은 `text/plain` 안에 일반 텍스트, 마크다운 표, Mermaid 코드펜스가 함께 들어 있을 때 첫 번째로 감지된 테이블만 삽입되고 나머지 블록은 사라진다.

대표 재현 입력:

````md
특이사항이 있음

| 항목 | 내용 |
| --- | --- |
| A | B |

```mermaid
graph TD
  A --> B
```
````

현재 결과:
- 표만 남는다.
- `특이사항이 있음` 문단이 사라진다.
- Mermaid 블록이 사라진다.

## 원인

`parseMarkdownTable(text)`는 전체 붙여넣기 텍스트에서 첫 번째 마크다운 표를 찾아 표 HTML 하나만 반환한다.

이후 paste handler가 `event.preventDefault()`를 호출하고 표 slice만 삽입한 뒤 `return true`로 종료한다.

따라서 테이블 앞뒤에 있던 일반 텍스트와 Mermaid 코드펜스는 처리되지 않는다.

## 목표

- 복합 Markdown 붙여넣기에서 원본 블록 순서를 보존한다.
- 일반 문단, 마크다운 표, Mermaid 코드펜스, 일반 코드펜스, Markdown 링크를 같은 붙여넣기 안에서 함께 처리한다.
- 기존 단독 붙여넣기 동작을 유지한다.
- KQL/파이프 연산자 오파싱 방지를 유지한다.

## 비목표

- 완전한 Markdown 파서 도입은 이번 범위에서 제외한다.
- 모든 Markdown 문법을 TipTap 노드로 변환하지 않는다.
- HTML 클립보드 변환 경로는 이번 범위에서 건드리지 않는다.
- 이미지 붙여넣기 및 내부 이미지 클론 흐름은 그대로 둔다.

## 설계 방향

단일 `parseMarkdownTable`, `parseMarkdownCodeBlock`, `parseMarkdownLinksToHtml` 분기 대신, `text/plain`을 블록 단위로 스캔해 HTML 조각을 순서대로 만든다.

새 유틸 후보:

```ts
function parseMarkdownPasteToHtml(text: string): string | null
```

처리 원칙:

- 코드펜스는 시작 fence부터 종료 fence까지 하나의 블록으로 취급한다.
- ` ```mermaid ` 코드펜스는 `<div data-type="mermaid-block" data-code="...">` 또는 ProseMirror node 직접 생성 방식으로 변환한다.
- 일반 코드펜스는 현재 codeBlock node가 읽을 수 있는 HTML 구조 또는 node 직접 생성 방식으로 변환한다.
- 마크다운 표는 헤더 행과 구분행이 연속된 경우에만 표로 변환한다.
- 표 앞뒤 일반 텍스트는 paragraph로 보존한다.
- 문단 내부 Markdown 링크는 기존 chip 링크 HTML 변환을 재사용한다.
- 처리 가능한 커스텀 블록이 하나도 없으면 `null`을 반환해 기본 Tiptap 붙여넣기로 넘긴다.

## 구현 단계

### Phase 1 — 블록 스캐너 추가

`components/document-editor.tsx`에 블록 스캐너를 추가한다.

블록 타입:

```ts
type MarkdownPasteBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'table'; lines: string[] }
  | { type: 'code'; language: string | null; code: string }
```

스캔 규칙:

- 빈 줄은 문단 구분으로 사용한다.
- fence 시작 정규식은 기존 `parseMarkdownCodeBlock`과 맞춘다.
- fence 내부에서는 표 탐지를 하지 않는다.
- 표는 `header line + divider line + row lines`만 소비한다.
- 표 row는 `|`가 있는 동안만 이어 붙인다.

### Phase 2 — HTML/노드 변환 통합

기존 함수들을 재사용 가능한 단위로 분리한다.

후보 분리:

- `renderMarkdownTableHtml(lines: string[]): string | null`
- `renderInlineMarkdown(value: string): string`
- `renderParagraphHtml(text: string): string`
- `renderCodeBlockHtml(language: string | null, code: string): string`
- `renderMermaidBlockHtml(code: string): string`

주의:
- Mermaid block의 `code` attr에는 HTML escape가 필요하다.
- 코드 블록 내용은 텍스트로 들어가야 하므로 HTML escape가 필요하다.
- 링크 href와 label 모두 escape한다. 현재 table inline link 변환은 label/href escape가 부족하므로 함께 보강한다.

### Phase 3 — paste handler 교체

현재 순서:

```ts
const tableHtml = parseMarkdownTable(text)
if (tableHtml) { ... return true }

const codeBlock = parseMarkdownCodeBlock(text)
if (codeBlock) { ... return true }

const markdownLinkHtml = parseMarkdownLinksToHtml(text)
if (markdownLinkHtml) { ... return true }
```

변경 후:

```ts
const markdownPasteHtml = parseMarkdownPasteToHtml(text)
if (markdownPasteHtml) {
  event.preventDefault()
  const wrapper = document.createElement('div')
  wrapper.innerHTML = markdownPasteHtml
  const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(wrapper)
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
  return true
}
```

단, DOMParser 방식으로 Mermaid/codeBlock attr 보존이 불안정하면 HTML 변환 대신 block list를 ProseMirror node/slice로 직접 조립한다.

### Phase 4 — 회귀 테스트 케이스 보강

`scripts/editor-syntax-test.cjs`에 케이스를 추가한다.

추가 케이스:

- 일반 문단 + 표 + Mermaid
- 표 + 일반 문단 + Mermaid
- Mermaid + 표
- 일반 코드펜스 안에 파이프가 있는 KQL
- 구분행 없는 파이프 텍스트
- Markdown 링크가 들어 있는 문단 + 표 셀 링크

기대 결과:

- 복합 문서에서 모든 블록이 순서대로 남는다.
- Mermaid는 `mermaidBlock`으로 렌더링된다.
- KQL 코드펜스는 표로 오파싱되지 않는다.
- 구분행 없는 파이프 텍스트는 표로 오파싱되지 않는다.
- 표 단독 붙여넣기는 기존처럼 표로 변환된다.
- Mermaid 단독 붙여넣기는 기존처럼 Mermaid 블록으로 변환된다.

## 검증 방법

정적 검증:

```sh
npm run typecheck
```

브라우저 검증:

```sh
npm run dev
node scripts/editor-syntax-test.cjs
```

수동 확인:

1. 새 페이지에 대표 재현 입력을 붙여넣는다.
2. `특이사항이 있음` 문단이 표 위에 남는지 확인한다.
3. 표가 TipTap table로 변환되는지 확인한다.
4. Mermaid 블록이 표 아래에서 렌더링되는지 확인한다.
5. Mermaid 편집 버튼으로 source가 보존되는지 확인한다.

## 리스크

### 1. Mermaid HTML parse/render attr 불일치

`MermaidBlock.parseHTML()`은 현재 `div[data-type="mermaid-block"]`만 읽는다. HTML 경유 방식에서 `code` attr을 제대로 읽지 못하면 빈 Mermaid 블록이 될 수 있다.

대응:
- `parseHTML().getAttrs`를 추가해 `data-code`를 읽게 한다.
- 더 안전한 대안으로 ProseMirror node를 직접 생성한다.

### 2. 코드블록 HTML 구조 불일치

Tiptap codeBlock이 기대하는 HTML 구조와 다르면 일반 문단으로 들어갈 수 있다.

대응:
- 단독 codeBlock 붙여넣기 기존 동작을 테스트로 고정한다.
- 필요하면 codeBlock도 node 직접 생성 방식으로 처리한다.

### 3. 표 파싱 회귀

기존 KQL 오파싱 수정이 되돌아갈 수 있다.

대응:
- 표는 반드시 divider row가 있는 경우에만 인식한다.
- fence 내부에서는 표 파싱을 금지한다.

### 4. 부분 Markdown 지원의 경계

완전한 Markdown 파서가 아니므로 heading/list/blockquote 같은 문법은 기본 Tiptap 처리와 섞일 수 있다.

대응:
- 이번 수정의 성공 기준을 paragraph/table/code/mermaid/link 보존으로 제한한다.
- 향후 필요하면 Markdown parser 라이브러리 도입을 별도 계획으로 분리한다.

## 완료 기준

- 복합 Markdown 붙여넣기에서 일반 텍스트, 표, Mermaid가 모두 보존된다.
- 기존 단독 표/Mermaid/code/link 붙여넣기가 깨지지 않는다.
- KQL 및 구분행 없는 파이프 텍스트가 표로 오파싱되지 않는다.
- `npm run typecheck`가 통과한다.
- 자동 또는 수동 브라우저 검증 결과를 개발 이력 문서에 남긴다.
