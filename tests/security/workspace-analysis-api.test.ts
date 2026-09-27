import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const service = readFileSync('lib/ai/analysis-service.ts', 'utf8')
const route = readFileSync('app/api/ai/workspace-analysis/route.ts', 'utf8')
const statusRoute = readFileSync('app/api/ai/workspace-analysis/[id]/route.ts', 'utf8')
const migration = readFileSync('supabase/migrations/008_ai_document_editing.sql', 'utf8')

describe('workspace analysis execution boundary', () => {
  it('freshly authenticates and accepts IDs rather than browser document content', () => {
    expect(route).toContain('{ fresh: true }')
    expect(route).toContain('pageIds: Array.isArray(body.pageIds)')
    expect(route).not.toMatch(/body\.(?:content|title|model)/)
    expect(route).toContain('MAX_BODY_BYTES')
  })

  it('checks policy and credential before source loading, then policy again before provider execution', () => {
    const firstPolicy = service.indexOf('await requireAllowed(input.workspaceId')
    const credentialLookup = service.indexOf(".from('user_ai_credentials')")
    const sourceLoad = service.indexOf('await loadVerifiedDocumentSources')
    const secondPolicy = service.indexOf('await requireAllowed(input.workspaceId', firstPolicy + 1)
    const providerCall = service.indexOf('await provider.analyze')
    expect(firstPolicy).toBeGreaterThan(-1)
    expect(firstPolicy).toBeLessThan(credentialLookup)
    expect(credentialLookup).toBeLessThan(sourceLoad)
    expect(firstPolicy).toBeLessThan(sourceLoad)
    expect(secondPolicy).toBeGreaterThan(sourceLoad)
    expect(secondPolicy).toBeLessThan(providerCall)
  })

  it('stores revisions and blocks duplicate execution with a user-scoped hash', () => {
    expect(service).toContain("createHash('sha256').update(input.idempotencyKey")
    expect(service).toContain(".eq('created_by', input.userId).eq('idempotency_key_hash', idempotencyHash)")
    expect(service).toContain('content_revision: source.contentRevision')
    expect(migration).toContain('UNIQUE (created_by, idempotency_key_hash)')
    expect(migration).toContain('page_revision <> NEW.content_revision')
  })

  it('never mutates pages and scopes status reads to the authenticated creator', () => {
    expect(service).not.toMatch(/from\(['"]pages['"]\)\.(?:insert|update|upsert|delete)/)
    expect(statusRoute).toContain('{ fresh: true }')
    expect(service).toContain(".eq('id', requestId).eq('created_by', userId)")
  })

  it('maps cancellation and provider failures to terminal ledger states', () => {
    expect(service).toContain("status: 'cancelled'")
    expect(service).toContain("status: 'failed', error_code: ledgerErrorCode(error)")
    expect(service).toContain("status: 'succeeded'")
  })
})
