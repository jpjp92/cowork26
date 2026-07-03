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

  const updatedAtById = new Map(pages.map(p => [p.id, p.updated_at]))
  return results.sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1
    return (updatedAtById.get(b.id) ?? '').localeCompare(updatedAtById.get(a.id) ?? '')
  })
}
