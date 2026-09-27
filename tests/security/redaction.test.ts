import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { redactSensitive, safeLogJson } = await import('../../lib/ai/redact-sensitive')

describe('sensitive data redaction', () => {
  it('redacts nested credentials, headers, and registered document markers', () => {
    const apiKey = 'sk-super-secret-marker'
    const documentMarker = 'PRIVATE_DOCUMENT_MARKER_93ac'
    const input = {
      provider: 'openai',
      apiKey,
      request: {
        headers: new Headers({
          authorization: `Bearer ${apiKey}`,
          'x-goog-api-key': 'gemini-secret-with-unusual-format',
          'x-request-id': 'request-1',
        }),
        messages: [{ role: 'user', content: documentMarker }],
      },
    }

    const output = safeLogJson(input, { secrets: [apiKey, documentMarker] })
    expect(output).not.toContain(apiKey)
    expect(output).not.toContain(documentMarker)
    expect(output).not.toContain('Bearer')
    expect(output).not.toContain('gemini-secret-with-unusual-format')
    expect(output).toContain('request-1')
    expect(output).toContain('[REDACTED]')
  })

  it('sanitizes Error messages and causes without returning stacks', () => {
    const error = new Error('Authorization: Bearer token-value sk-secret-value', {
      cause: new Error('api_key=another-secret'),
    })
    const redacted = redactSensitive(error)
    const output = JSON.stringify(redacted)

    expect(output).not.toContain('token-value')
    expect(output).not.toContain('sk-secret-value')
    expect(output).not.toContain('another-secret')
    expect(output).not.toContain('stack')
  })

  it('handles cycles, depth limits, arrays, and getters that throw', () => {
    const cyclic: Record<string, unknown> = { ok: true, items: [1, 2] }
    cyclic.self = cyclic
    Object.defineProperty(cyclic, 'broken', {
      enumerable: true,
      get() { throw new Error('getter secret') },
    })

    const output = redactSensitive({ nested: { cyclic } }, { maxDepth: 4 })
    const serialized = JSON.stringify(output)
    expect(serialized).toContain('[Circular]')
    expect(serialized).toContain('[Unserializable]')
    expect(serialized).not.toContain('getter secret')
  })

  it('does not mutate the input object', () => {
    const input = { authorization: 'Bearer original', safe: { value: 1 } }
    redactSensitive(input)
    expect(input).toEqual({ authorization: 'Bearer original', safe: { value: 1 } })
  })
})
