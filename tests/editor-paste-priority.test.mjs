import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const editorSource = await readFile(new URL('../components/document-editor.tsx', import.meta.url), 'utf8')
const handlePasteStart = editorSource.indexOf('handlePaste(view, event)')
const handlePasteEnd = editorSource.indexOf('handleDOMEvents:', handlePasteStart)

assert.notEqual(handlePasteStart, -1, 'handlePaste 구현을 찾을 수 없음')
assert.notEqual(handlePasteEnd, -1, 'handlePaste 구현의 끝을 찾을 수 없음')

const handlePasteSource = editorSource.slice(handlePasteStart, handlePasteEnd)
const tableGuard = handlePasteSource.indexOf('if (hasPastedTable) return false')
const internalSliceGuard = handlePasteSource.indexOf("if (pasteHtml.includes('data-pm-slice')) return false")
const sourceCodeHeuristic = handlePasteSource.indexOf('if (!inCodeBlock && looksLikeSourceCode(text))')
const markdownParser = handlePasteSource.indexOf('parseMarkdownPasteToSlice(view.state.schema, text)')

assert.ok(tableGuard >= 0, 'HTML 표 보존 가드가 없음')
assert.ok(internalSliceGuard >= 0, '내부 ProseMirror 복사 보존 가드가 없음')
assert.ok(sourceCodeHeuristic >= 0, '외부 소스 코드 휴리스틱이 없음')
assert.ok(markdownParser >= 0, 'Markdown 붙여넣기 파서가 없음')

assert.ok(
  tableGuard < internalSliceGuard,
  'HTML 표 보존은 내부 일반 복사 판정보다 먼저 처리해야 함',
)
assert.ok(
  internalSliceGuard < sourceCodeHeuristic,
  'data-pm-slice 내부 복사는 소스 코드 휴리스틱보다 먼저 보존해야 함',
)
assert.ok(
  sourceCodeHeuristic < markdownParser,
  '외부 소스 코드는 Markdown 재파싱보다 먼저 처리해야 함',
)

console.log('editor paste priority regression test: passed')
