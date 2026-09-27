import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiProvider } from '../../lib/ai/provider-contract'

const from = vi.fn()
const encryptCredential = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('../../lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
vi.mock('../../lib/ai/env', () => ({
  ACTIVE_CREDENTIAL_KEY_VERSION: 1,
  aiEnvironment: {
    featureEnabled: true,
    openAiEnabled: true,
    geminiEnabled: true,
    workspaceAnalysisEnabled: false,
    activeCredentialKeyVersion: 1,
  },
}))
vi.mock('../../lib/ai/credential-crypto', () => ({ encryptCredential }))

const userId = '7ee06e5b-b1ab-4dd3-830b-9be777a41845'

describe('AI credential service authorization boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    encryptCredential.mockReturnValue({
      ciphertext: 'encrypted-value',
      nonce: 'nonce-value',
      authTag: 'tag-value',
      keyVersion: 1,
    })
  })

  it('verifies first and stores encrypted fields scoped to the authenticated user', async () => {
    const marker = 'fake-success-PRIVATE-MARKER-7890'
    const events: string[] = []
    let stored: Record<string, unknown> | undefined
    const single = vi.fn(async () => {
      events.push('database')
      return {
        data: {
          provider: 'openai',
          key_last_four: '7890',
          verified_at: '2026-09-27T00:00:00.000Z',
          updated_at: '2026-09-27T00:00:00.000Z',
        },
        error: null,
      }
    })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn((value: Record<string, unknown>) => {
      stored = value
      return { select }
    })
    from.mockReturnValue({ upsert })
    const verificationProvider: AiProvider = {
      verifyCredential: vi.fn(async () => {
        events.push('verify')
        return { valid: true as const }
      }),
      analyze: vi.fn(async () => { throw new Error('not used') }),
    }
    const { verifyAndStoreCredential } = await import('../../lib/ai/credential-service')

    const result = await verifyAndStoreCredential({
      userId,
      provider: 'openai',
      apiKey: marker,
      signal: new AbortController().signal,
      verificationProvider,
    })

    expect(events).toEqual(['verify', 'database'])
    expect(encryptCredential).toHaveBeenCalledWith(marker, { userId, provider: 'openai', keyVersion: 1 })
    expect(stored).toMatchObject({
      user_id: userId,
      provider: 'openai',
      ciphertext: 'encrypted-value',
      nonce: 'nonce-value',
      auth_tag: 'tag-value',
      key_last_four: '7890',
    })
    expect(JSON.stringify(stored)).not.toContain(marker)
    expect(result).toEqual({
      provider: 'openai',
      connected: true,
      keyLastFour: '7890',
      verifiedAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
    })
  })

  it('does not encrypt or write when provider verification fails', async () => {
    const upsert = vi.fn()
    from.mockReturnValue({ upsert })
    const verificationProvider: AiProvider = {
      verifyCredential: vi.fn(async () => { throw new Error('rejected') }),
      analyze: vi.fn(async () => { throw new Error('not used') }),
    }
    const { verifyAndStoreCredential } = await import('../../lib/ai/credential-service')

    await expect(verifyAndStoreCredential({
      userId,
      provider: 'openai',
      apiKey: 'fake-invalid-1234',
      signal: new AbortController().signal,
      verificationProvider,
    })).rejects.toThrow('rejected')
    expect(encryptCredential).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('scopes deletion by both user and provider', async () => {
    const finalEq = vi.fn().mockResolvedValue({ error: null })
    const firstEq = vi.fn(() => ({ eq: finalEq }))
    const deleteQuery = vi.fn(() => ({ eq: firstEq }))
    from.mockReturnValue({ delete: deleteQuery })
    const { deleteCredential } = await import('../../lib/ai/credential-service')

    await deleteCredential(userId, 'gemini')
    expect(firstEq).toHaveBeenCalledWith('user_id', userId)
    expect(finalEq).toHaveBeenCalledWith('provider', 'gemini')
  })
})
