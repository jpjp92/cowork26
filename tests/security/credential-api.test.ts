import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserFromRequest = vi.fn()
const getCredentialStatus = vi.fn()
const verifyAndStoreCredential = vi.fn()
const deleteCredential = vi.fn()
const consume = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('../../app/api/_utils/auth', () => ({ getUserFromRequest }))
vi.mock('../../lib/ai/credential-service', () => ({
  getCredentialStatus,
  verifyAndStoreCredential,
  deleteCredential,
}))
vi.mock('../../lib/ai/credential-rate-limit', () => ({
  credentialVerifyRateLimiter: { consume },
}))

const context = (provider = 'openai') => ({ params: Promise.resolve({ provider }) })
const request = (method: string, body?: unknown) => new Request('http://localhost/api/ai/credentials/openai', {
  method,
  headers: { authorization: 'Bearer token', ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
})

describe('AI credential route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getUserFromRequest.mockResolvedValue({ user: { id: 'user-1' }, response: null })
    consume.mockReturnValue({ allowed: true })
    getCredentialStatus.mockResolvedValue({
      provider: 'openai',
      connected: true,
      keyLastFour: '7890',
      verifiedAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
    })
    verifyAndStoreCredential.mockResolvedValue({
      provider: 'openai',
      connected: true,
      keyLastFour: '7890',
      verifiedAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
    })
    deleteCredential.mockResolvedValue(undefined)
  })

  it('returns only masked status with no-store and fresh authentication', async () => {
    const { GET } = await import('../../app/api/ai/credentials/[provider]/route')
    const response = await GET(request('GET'), context())
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(serialized).toContain('7890')
    expect(serialized).not.toMatch(/ciphertext|nonce|authTag|auth_tag/i)
    expect(getUserFromRequest).toHaveBeenCalledWith(expect.any(Request), undefined, { fresh: true })
    expect(getCredentialStatus).toHaveBeenCalledWith('user-1', 'openai')
  })

  it('does not echo a marker API key after verification and storage', async () => {
    const marker = 'fake-success-PRIVATE-KEY-7890'
    const { PUT } = await import('../../app/api/ai/credentials/[provider]/route')
    const response = await PUT(request('PUT', { apiKey: marker }), context())
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(serialized).not.toContain(marker)
    expect(verifyAndStoreCredential).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', provider: 'openai', apiKey: marker,
    }))
  })

  it('deletes only the authenticated user credential and remains available when flags are off', async () => {
    const { DELETE } = await import('../../app/api/ai/credentials/[provider]/route')
    const response = await DELETE(request('DELETE'), context('gemini'))
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(deleteCredential).toHaveBeenCalledWith('user-1', 'gemini')
  })

  it('rejects unknown providers before calling credential storage', async () => {
    const { PUT } = await import('../../app/api/ai/credentials/[provider]/route')
    const response = await PUT(request('PUT', { apiKey: 'marker-key' }), context('other'))
    expect(response.status).toBe(422)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(verifyAndStoreCredential).not.toHaveBeenCalled()
  })

  it('returns a bounded rate-limit response without verifying the key', async () => {
    consume.mockReturnValue({ allowed: false, retryAfterSeconds: 60 })
    const { PUT } = await import('../../app/api/ai/credentials/[provider]/route')
    const response = await PUT(request('PUT', { apiKey: 'marker-key' }), context())
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(verifyAndStoreCredential).not.toHaveBeenCalled()
  })

  it('redacts unexpected service errors from the network response', async () => {
    const marker = 'PRIVATE_API_KEY_MARKER'
    verifyAndStoreCredential.mockRejectedValue(new Error(`provider leaked ${marker}`))
    const { PUT } = await import('../../app/api/ai/credentials/[provider]/route')
    const response = await PUT(request('PUT', { apiKey: marker }), context())
    const serialized = JSON.stringify(await response.json())
    expect(response.status).toBe(500)
    expect(serialized).not.toContain(marker)
    expect(serialized).toContain('INTERNAL_ERROR')
  })
})
