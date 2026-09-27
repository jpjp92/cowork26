import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { isRevisionedPagePatch, isValidBaseRevision } from '../../lib/notion-lite/page-revision'

const migration = await readFile(
  new URL('../../supabase/migrations/007_page_content_revision.sql', import.meta.url),
  'utf8',
)
const route = await readFile(new URL('../../app/api/pages/route.ts', import.meta.url), 'utf8')

describe('page revision contract', () => {
  it('requires revisions only for title and content mutations', () => {
    expect(isRevisionedPagePatch({ title: 'New' })).toBe(true)
    expect(isRevisionedPagePatch({ content: null })).toBe(true)
    expect(isRevisionedPagePatch({})).toBe(false)
  })

  it('accepts only non-negative safe integer revisions', () => {
    expect(isValidBaseRevision(0)).toBe(true)
    expect(isValidBaseRevision(42)).toBe(true)
    for (const value of [-1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1, null]) {
      expect(isValidBaseRevision(value)).toBe(false)
    }
  })

  it('increments revisions only when title or content changes', () => {
    expect(migration).toMatch(/OLD\.title IS DISTINCT FROM NEW\.title/)
    expect(migration).toMatch(/OLD\.content IS DISTINCT FROM NEW\.content/)
    expect(migration).toMatch(/NEW\.content_revision := OLD\.content_revision \+ 1/)
    expect(migration).toMatch(/NEW\.content_revision := OLD\.content_revision;/)
  })

  it('uses a conditional update and returns a conflict for stale saves', () => {
    expect(route).toMatch(/updateQuery\.eq\('content_revision', body\.baseRevision\)/)
    expect(route).toMatch(/new ApiError\('PAGE_REVISION_CONFLICT'\)/)
    expect(route).toMatch(/\.maybeSingle\(\)/)
  })

  it('blocks browser mutation bypasses', () => {
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*ON TABLE public\.pages FROM PUBLIC, anon, authenticated/)
  })
})
