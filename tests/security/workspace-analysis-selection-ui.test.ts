import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/notion-lite/workspace-analysis-dialog.tsx', 'utf8')

describe('workspace analysis selection UI boundary', () => {
  it('sends only workspace, page IDs, provider, mode, and bounded additional request in its draft', () => {
    expect(source).toContain('pageIds: selectedPages.map(page => page.id)')
    expect(source).toContain('additionalRequest: additionalRequest.trim()')
    expect(source).toContain('provider,')
    expect(source).not.toMatch(/content:\s*page\.content|title:\s*page\.title/)
    expect(source).toContain('maxLength={MAX_ANALYSIS_ADDITIONAL_REQUEST_CHARS}')
  })

  it('blocks confirmation when page count or estimated bytes exceed shared limits', () => {
    expect(source).toContain('selectedIds.size > MAX_ANALYSIS_PAGES')
    expect(source).toContain('estimatedBytes > MAX_ANALYSIS_SOURCE_BYTES')
    expect(source).toContain('disabled={!canConfirm}')
  })

  it('requires explicit selection for current page, descendants, or manual pages', () => {
    expect(source).toContain('현재 페이지만')
    expect(source).toContain('현재 + 하위 페이지')
    expect(source).toContain('collectPageAndDescendantIds')
    expect(source).toContain('분석에 포함할 페이지')
    expect(source).toContain('페이지 생성이나 다운로드는 자동으로 하지 않습니다.')
  })
})
