import { describe, expect, it } from 'vitest'
import { ApiError, serializeApiError } from '../../app/api/_utils/api-error'

describe('API error contract', () => {
  it.each([
    ['INVALID_JSON', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['PAYLOAD_TOO_LARGE', 413],
    ['VALIDATION_ERROR', 422],
  ] as const)('maps %s to %i', (code, status) => {
    expect(serializeApiError(new ApiError(code), 'request-1')).toMatchObject({
      status,
      body: { error: { code, requestId: 'request-1' } },
    })
  })

  it('does not serialize raw secrets, authorization values, or document content', () => {
    const marker = 'PRIVATE_DOCUMENT_MARKER_7f42'
    const raw = new Error(`Authorization: Bearer secret-token apiKey=sk-secret ${marker}`)
    const serialized = JSON.stringify(serializeApiError(raw, 'request-2'))

    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain(marker)
    expect(serialized).not.toContain(raw.message)
    expect(serialized).toContain('INTERNAL_ERROR')
  })
})

