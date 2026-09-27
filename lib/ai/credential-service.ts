import 'server-only'

import { supabaseAdmin } from '../supabase-admin'
import { encryptCredential } from './credential-crypto'
import { ACTIVE_CREDENTIAL_KEY_VERSION, aiEnvironment } from './env'
import type { AiProvider } from './provider-contract'
import { AiProviderError } from './provider-errors'
import type { AiProviderId } from './providers'
import { getAiProvider } from './provider-factory'

const MAX_API_KEY_BYTES = 8 * 1024

type CredentialRow = {
  provider: AiProviderId
  key_last_four: string
  verified_at: string
  updated_at: string
}

export type CredentialStatus = {
  provider: AiProviderId
  connected: boolean
  keyLastFour?: string
  verifiedAt?: string
  updatedAt?: string
}

function normalizeApiKey(value: unknown) {
  if (typeof value !== 'string') throw new TypeError('API key must be a string.')
  const normalized = value.trim()
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > MAX_API_KEY_BYTES || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new TypeError('API key is invalid.')
  }
  if (Array.from(normalized).length < 4) throw new TypeError('API key is invalid.')
  return normalized
}

export function getCredentialVerificationProvider(provider: AiProviderId): AiProvider {
  return getAiProvider(provider)
}

export async function getCredentialStatus(
  userId: string,
  provider: AiProviderId,
): Promise<CredentialStatus> {
  const { data, error } = await supabaseAdmin
    .from('user_ai_credentials')
    .select('provider, key_last_four, verified_at, updated_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle<CredentialRow>()

  if (error) throw new Error('Credential status lookup failed.')
  if (!data) return { provider, connected: false }
  return {
    provider,
    connected: true,
    keyLastFour: data.key_last_four,
    verifiedAt: data.verified_at,
    updatedAt: data.updated_at,
  }
}

export async function verifyAndStoreCredential(input: {
  userId: string
  provider: AiProviderId
  apiKey: unknown
  signal: AbortSignal
  verificationProvider?: AiProvider
}): Promise<CredentialStatus> {
  const apiKey = normalizeApiKey(input.apiKey)
  const providerEnabled = input.provider === 'openai'
    ? aiEnvironment.openAiEnabled
    : aiEnvironment.geminiEnabled
  if (!aiEnvironment.featureEnabled || !providerEnabled) {
    throw new AiProviderError('provider_unavailable')
  }

  const verificationProvider = input.verificationProvider ?? getCredentialVerificationProvider(input.provider)
  await verificationProvider.verifyCredential(apiKey, input.signal)
  const encrypted = encryptCredential(apiKey, {
    userId: input.userId,
    provider: input.provider,
    keyVersion: ACTIVE_CREDENTIAL_KEY_VERSION,
  })
  const keyLastFour = Array.from(apiKey).slice(-4).join('')
  const verifiedAt = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('user_ai_credentials')
    .upsert({
      user_id: input.userId,
      provider: input.provider,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
      key_last_four: keyLastFour,
      verified_at: verifiedAt,
    }, { onConflict: 'user_id,provider' })
    .select('provider, key_last_four, verified_at, updated_at')
    .single<CredentialRow>()

  if (error || !data) throw new Error('Credential write failed.')
  return {
    provider: input.provider,
    connected: true,
    keyLastFour: data.key_last_four,
    verifiedAt: data.verified_at,
    updatedAt: data.updated_at,
  }
}

export async function deleteCredential(userId: string, provider: AiProviderId) {
  const { error } = await supabaseAdmin
    .from('user_ai_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
  if (error) throw new Error('Credential delete failed.')
}
