import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync('components/notion-lite-app.tsx', 'utf8')
const result = readFileSync('components/notion-lite/workspace-analysis-result.tsx', 'utf8')
const selection = readFileSync('components/notion-lite/workspace-analysis-dialog.tsx', 'utf8')
const sidebar = readFileSync('components/notion-lite/workspace-sidebar.tsx', 'utf8')
const documentPane = readFileSync('components/notion-lite/document-pane.tsx', 'utf8')
const utilityPanel = readFileSync('components/notion-lite/utility-panel.tsx', 'utf8')
const settingsPanel = readFileSync('components/notion-lite/settings-panel.tsx', 'utf8')

describe('workspace analysis result UI', () => {
  it('supports abort, retry by returning to selection, and source navigation', () => {
    expect(app).toContain('analysisAbortRef.current?.abort()')
    expect(result).toContain('분석 취소')
    expect(result).toContain("error ? '다시 선택' : '새 분석'")
    expect(result).toContain('닫아도 이번 결과는 AI 분석 메뉴에 유지됩니다.')
    expect(result).toContain('onOpenPage(citation.pageId)')
  })

  it('does not render provider HTML or mutate page content from a result', () => {
    expect(result).not.toContain('dangerouslySetInnerHTML')
    expect(app).not.toMatch(/analysisResult[^\n]*updatePage/)
    expect(result).toContain('결과는 페이지에 자동 저장되지 않습니다.')
  })

  it('keeps navigation entry in the sidebar and analysis workspace in a responsive right panel', () => {
    expect(sidebar).toContain('워크스페이스 도구')
    expect(sidebar).toContain('AI 분석')
    expect(sidebar).toContain('분석 중')
    expect(documentPane).not.toContain('AI 분석')
    expect(selection).toContain('<UtilityPanel')
    expect(result).toContain('<UtilityPanel')
    expect(settingsPanel).toContain('<UtilityPanel')
    expect(utilityPanel).toContain('justify-end')
    expect(utilityPanel).toContain('md:w-[min(22rem,calc(100vw-1.5rem))]')
    expect(utilityPanel).toContain('md:max-h-[calc(100dvh-5.5rem)]')
    expect(utilityPanel).toContain('md:shadow-[5px_5px_0_#000]')
  })

  it('uses honest stage feedback instead of fabricated progress percentages', () => {
    expect(result).toContain('권한 및 정책 확인')
    expect(result).toContain('최신 문서 수집')
    expect(result).toContain('AI 분석 중')
    expect(result).toContain('결과 검증')
    expect(result).not.toMatch(/\d+%|progressbar/)
  })

  it('shows an accessible animated analysis indicator', () => {
    expect(result).toContain('문서를 분석하고 있습니다')
    expect(result).toContain('loading-dots')
    expect(result).toContain('AI 분석 중')
    expect(result).toContain('motion-reduce:animate-none')
  })
})
