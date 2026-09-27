import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('../../lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

import {
  MAX_ANALYSIS_SOURCE_BYTES,
  loadVerifiedDocumentSources,
  normalizeVerifiedPageRows,
} from '../../lib/ai/document-source'

const workspaceId = 'f0bece0f-b21b-4f98-a374-01815c01c4fa'
const page1 = '11111111-1111-4111-8111-111111111111'
const page2 = '22222222-2222-4222-8222-222222222222'

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: workspaceId,
    title: `Page ${id.slice(0, 1)}`,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] }] },
    content_revision: 3,
    ...overrides,
  }
}

describe('verified document source normalization', () => {
  beforeEach(() => from.mockReset())
  it('preserves requested order while exposing only opaque provider labels', () => {
    const result = normalizeVerifiedPageRows(workspaceId, [page2, page1], [row(page1), row(page2)])
    expect(result.providerSources.map(source => source.label)).toEqual(['S1', 'S2'])
    expect(result.providerSources.map(source => source.title)).toEqual(['Page 2', 'Page 1'])
    expect(result.metadata).toEqual([
      expect.objectContaining({ label: 'S1', pageId: page2, pageTitle: 'Page 2', contentRevision: 3 }),
      expect.objectContaining({ label: 'S2', pageId: page1, pageTitle: 'Page 1', contentRevision: 3 }),
    ])
    expect(JSON.stringify(result.providerSources)).not.toContain(page1)
    expect(JSON.stringify(result.providerSources)).not.toContain(page2)
  })

  it('normalizes control characters and empty body without trusting node attributes', () => {
    const result = normalizeVerifiedPageRows(workspaceId, [page1], [row(page1, {
      title: '  안전\u0000 제목  ',
      content: {
        type: 'doc',
        attrs: { secret: 'DO_NOT_INCLUDE' },
        content: [{ type: 'image', attrs: { src: 'https://secret.invalid/image' } }],
      },
    })])
    expect(result.providerSources[0]).toMatchObject({ title: '안전 제목', content: '(본문 없음)' })
    expect(JSON.stringify(result.providerSources)).not.toContain('DO_NOT_INCLUDE')
    expect(JSON.stringify(result.providerSources)).not.toContain('secret.invalid')
  })

  it.each([
    [[page1, page1], [row(page1)], 'INVALID_SOURCE_REQUEST'],
    [['not-a-uuid'], [], 'INVALID_SOURCE_REQUEST'],
    [[page1], [], 'SOURCE_NOT_FOUND'],
    [[page1], [row(page1, { workspace_id: '33333333-3333-4333-8333-333333333333' })], 'SOURCE_NOT_FOUND'],
  ] as const)('rejects duplicate, malformed, missing, and cross-workspace pages', (ids, rows, code) => {
    expect(() => normalizeVerifiedPageRows(workspaceId, ids, rows)).toThrowError(expect.objectContaining({ code }))
  })

  it('enforces ten pages and the normalized UTF-8 byte budget', () => {
    const ids = Array.from({ length: 11 }, (_, index) => `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`)
    expect(() => normalizeVerifiedPageRows(workspaceId, ids, [])).toThrowError(expect.objectContaining({ code: 'INVALID_SOURCE_REQUEST' }))
    expect(() => normalizeVerifiedPageRows(workspaceId, [page1], [row(page1, {
      content: { type: 'doc', content: [{ type: 'text', text: '가'.repeat(MAX_ANALYSIS_SOURCE_BYTES) }] },
    })])).toThrowError(expect.objectContaining({ code: 'SOURCE_TOO_LARGE' }))
  })

  it('checks membership before loading page content from the database', async () => {
    const membershipMaybeSingle = vi.fn().mockResolvedValue({ data: { role: 'editor' }, error: null })
    const membershipEqUser = vi.fn(() => ({ maybeSingle: membershipMaybeSingle }))
    const membershipEqWorkspace = vi.fn(() => ({ eq: membershipEqUser }))
    const membershipSelect = vi.fn(() => ({ eq: membershipEqWorkspace }))
    const pagesIn = vi.fn().mockResolvedValue({ data: [row(page1)], error: null })
    const pagesEq = vi.fn(() => ({ in: pagesIn }))
    const pagesSelect = vi.fn(() => ({ eq: pagesEq }))
    from.mockImplementation((table: string) => (
      table === 'workspace_members' ? { select: membershipSelect } : { select: pagesSelect }
    ))

    const result = await loadVerifiedDocumentSources({
      workspaceId,
      userId: '7ee06e5b-b1ab-4dd3-830b-9be777a41845',
      pageIds: [page1],
    })

    expect(from.mock.calls.map(call => call[0])).toEqual(['workspace_members', 'pages'])
    expect(membershipEqWorkspace).toHaveBeenCalledWith('workspace_id', workspaceId)
    expect(membershipEqUser).toHaveBeenCalledWith('user_id', '7ee06e5b-b1ab-4dd3-830b-9be777a41845')
    expect(pagesEq).toHaveBeenCalledWith('workspace_id', workspaceId)
    expect(pagesIn).toHaveBeenCalledWith('id', [page1])
    expect(result.providerSources[0].content).toBe('Body text')
  })

  it('does not query page content for a removed member', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqUser = vi.fn(() => ({ maybeSingle }))
    const eqWorkspace = vi.fn(() => ({ eq: eqUser }))
    const select = vi.fn(() => ({ eq: eqWorkspace }))
    from.mockReturnValue({ select })

    await expect(loadVerifiedDocumentSources({
      workspaceId,
      userId: '7ee06e5b-b1ab-4dd3-830b-9be777a41845',
      pageIds: [page1],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(from).toHaveBeenCalledTimes(1)
  })
})
