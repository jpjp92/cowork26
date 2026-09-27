import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
} = await import('../../lib/ai/credential-crypto')
const {
  AiEnvironmentError,
  getCredentialMasterKey,
  loadAiEnvironment,
  parseCredentialMasterKey,
} = await import('../../lib/ai/env')

const masterKey = randomBytes(32).toString('base64')
const otherMasterKey = randomBytes(32).toString('base64')
const environment = { AI_CREDENTIAL_ENCRYPTION_KEY_V1: masterKey }
const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '22222222-2222-4222-8222-222222222222'
const context = { userId, provider: 'openai' as const, keyVersion: 1 }

describe('AI credential environment', () => {
  it('accepts only a canonical Base64 32-byte key', () => {
    expect(parseCredentialMasterKey(masterKey, 'TEST_KEY')).toHaveLength(32)
    for (const value of ['', 'not base64', randomBytes(31).toString('base64'), `${masterKey}\n`]) {
      expect(() => parseCredentialMasterKey(value, 'TEST_KEY')).toThrow(AiEnvironmentError)
    }
  })

  it('looks up versioned keys and enforces the master feature flag', () => {
    expect(getCredentialMasterKey(1, environment)).toHaveLength(32)
    expect(() => getCredentialMasterKey(2, environment)).toThrow(/V2 is required/)
    expect(() => loadAiEnvironment({ AI_OPENAI_ENABLED: 'true' })).toThrow(/AI_FEATURE_ENABLED/)
    expect(loadAiEnvironment({
      ...environment,
      AI_FEATURE_ENABLED: 'true',
      AI_OPENAI_ENABLED: 'true',
      AI_GEMINI_ENABLED: 'false',
      AI_WORKSPACE_ANALYSIS_ENABLED: 'false',
    })).toMatchObject({ featureEnabled: true, openAiEnabled: true, geminiEnabled: false })
  })
})

describe('credential encryption', () => {
  it('round-trips and generates a unique nonce for every write', () => {
    const first = encryptCredential('sk-test-secret', context, environment)
    const second = encryptCredential('sk-test-secret', context, environment)

    expect(first.nonce).not.toBe(second.nonce)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(decryptCredential(first, { userId: context.userId, provider: context.provider }, environment))
      .toBe('sk-test-secret')
  })

  it('binds ciphertext to user, provider, key version, and master key', () => {
    const encrypted = encryptCredential('sk-test-secret', context, environment)

    expect(() => decryptCredential(encrypted, { userId: otherUserId, provider: 'openai' }, environment))
      .toThrow(CredentialCryptoError)
    expect(() => decryptCredential(encrypted, { userId, provider: 'gemini' }, environment))
      .toThrow(CredentialCryptoError)
    expect(() => decryptCredential({ ...encrypted, keyVersion: 2 }, context, environment))
      .toThrow(CredentialCryptoError)
    expect(() => decryptCredential(encrypted, context, {
      AI_CREDENTIAL_ENCRYPTION_KEY_V1: otherMasterKey,
    })).toThrow(CredentialCryptoError)
  })

  it.each(['ciphertext', 'nonce', 'authTag'] as const)('rejects a tampered %s', field => {
    const encrypted = encryptCredential('sk-test-secret', context, environment)
    const current = encrypted[field]
    const replacement = current[0] === 'A' ? 'B' : 'A'
    const tampered = { ...encrypted, [field]: `${replacement}${current.slice(1)}` }

    expect(() => decryptCredential(tampered, context, environment)).toThrowError(
      expect.objectContaining({ code: 'CREDENTIAL_DECRYPTION_FAILED' }),
    )
  })

  it('rejects empty, oversized, and malformed values', () => {
    expect(() => encryptCredential('   ', context, environment)).toThrowError(
      expect.objectContaining({ code: 'INVALID_CREDENTIAL_INPUT' }),
    )
    expect(() => encryptCredential('x'.repeat(8193), context, environment)).toThrow()

    const encrypted = encryptCredential('sk-test-secret', context, environment)
    expect(() => decryptCredential({ ...encrypted, nonce: '***' }, context, environment)).toThrowError(
      expect.objectContaining({ code: 'CREDENTIAL_DECRYPTION_FAILED' }),
    )
  })
})
