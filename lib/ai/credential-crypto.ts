import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getCredentialMasterKey, type EnvironmentSource } from './env'
import { isAiProviderId, type AiProviderId } from './providers'

const ALGORITHM = 'aes-256-gcm'
const NONCE_BYTES = 12
const AUTH_TAG_BYTES = 16
const MAX_CREDENTIAL_BYTES = 8 * 1024
const AAD_VERSION = 1
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CredentialCryptoContext = {
  userId: string
  provider: AiProviderId
  keyVersion: number
}

export type EncryptedCredential = {
  ciphertext: string
  nonce: string
  authTag: string
  keyVersion: number
}

export class CredentialCryptoError extends Error {
  readonly code:
    | 'INVALID_CREDENTIAL_INPUT'
    | 'INVALID_CREDENTIAL_CONTEXT'
    | 'CREDENTIAL_DECRYPTION_FAILED'

  constructor(code: CredentialCryptoError['code'], message: string) {
    super(message)
    this.name = 'CredentialCryptoError'
    this.code = code
  }
}

function validateContext(context: CredentialCryptoContext) {
  if (!UUID_RE.test(context.userId)) {
    throw new CredentialCryptoError('INVALID_CREDENTIAL_CONTEXT', 'Credential user ID is invalid.')
  }
  if (!isAiProviderId(context.provider)) {
    throw new CredentialCryptoError('INVALID_CREDENTIAL_CONTEXT', 'Credential provider is invalid.')
  }
  if (!Number.isSafeInteger(context.keyVersion) || context.keyVersion <= 0) {
    throw new CredentialCryptoError('INVALID_CREDENTIAL_CONTEXT', 'Credential key version is invalid.')
  }
}

function buildAdditionalAuthenticatedData(context: CredentialCryptoContext) {
  validateContext(context)
  return Buffer.from(
    `cowork26:user-ai-credential:v${AAD_VERSION}:${context.userId}:${context.provider}:${context.keyVersion}`,
    'utf8',
  )
}

function normalizeCredentialSecret(secret: string) {
  if (typeof secret !== 'string') {
    throw new CredentialCryptoError('INVALID_CREDENTIAL_INPUT', 'Credential must be a string.')
  }
  const normalized = secret.trim()
  const byteLength = Buffer.byteLength(normalized, 'utf8')
  if (!normalized || byteLength > MAX_CREDENTIAL_BYTES) {
    throw new CredentialCryptoError('INVALID_CREDENTIAL_INPUT', 'Credential length is invalid.')
  }
  return normalized
}

function decodeBase64Url(value: string, expectedBytes?: number) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid base64url value')
  }
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.toString('base64url') !== value) throw new Error('Non-canonical base64url value')
  if (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) {
    throw new Error('Unexpected decoded length')
  }
  return decoded
}

export function encryptCredential(
  secret: string,
  context: CredentialCryptoContext,
  environment: EnvironmentSource = process.env,
): EncryptedCredential {
  const normalized = normalizeCredentialSecret(secret)
  const aad = buildAdditionalAuthenticatedData(context)
  const masterKey = getCredentialMasterKey(context.keyVersion, environment)
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGORITHM, masterKey, nonce, { authTagLength: AUTH_TAG_BYTES })
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()])

  return {
    ciphertext: ciphertext.toString('base64url'),
    nonce: nonce.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    keyVersion: context.keyVersion,
  }
}

export function decryptCredential(
  encrypted: EncryptedCredential,
  context: Omit<CredentialCryptoContext, 'keyVersion'>,
  environment: EnvironmentSource = process.env,
) {
  try {
    const fullContext: CredentialCryptoContext = {
      ...context,
      keyVersion: encrypted.keyVersion,
    }
    const aad = buildAdditionalAuthenticatedData(fullContext)
    const masterKey = getCredentialMasterKey(encrypted.keyVersion, environment)
    const nonce = decodeBase64Url(encrypted.nonce, NONCE_BYTES)
    const authTag = decodeBase64Url(encrypted.authTag, AUTH_TAG_BYTES)
    const ciphertext = decodeBase64Url(encrypted.ciphertext)
    if (ciphertext.byteLength === 0 || ciphertext.byteLength > MAX_CREDENTIAL_BYTES) {
      throw new Error('Invalid ciphertext length')
    }

    const decipher = createDecipheriv(ALGORITHM, masterKey, nonce, { authTagLength: AUTH_TAG_BYTES })
    decipher.setAAD(aad)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plaintext.toString('utf8')
  } catch {
    throw new CredentialCryptoError(
      'CREDENTIAL_DECRYPTION_FAILED',
      'Stored AI credential could not be decrypted.',
    )
  }
}
