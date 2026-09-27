import 'server-only'

const MASTER_KEY_BYTES = 32
export const ACTIVE_CREDENTIAL_KEY_VERSION = 1
export type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type AiEnvironment = {
  featureEnabled: boolean
  openAiEnabled: boolean
  geminiEnabled: boolean
  workspaceAnalysisEnabled: boolean
  activeCredentialKeyVersion: number
}

export class AiEnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiEnvironmentError'
  }
}

function readBoolean(value: string | undefined, name: string) {
  if (value === undefined || value === '' || value === 'false') return false
  if (value === 'true') return true
  throw new AiEnvironmentError(`${name} must be exactly "true" or "false".`)
}

export function parseCredentialMasterKey(value: string | undefined, name: string) {
  if (!value) throw new AiEnvironmentError(`${name} is required.`)
  if (value !== value.trim() || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new AiEnvironmentError(`${name} must be canonical Base64.`)
  }

  const unpadded = value.replace(/=+$/, '')
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64').replace(/=+$/, '') !== unpadded) {
    throw new AiEnvironmentError(`${name} must be canonical Base64.`)
  }
  if (decoded.byteLength !== MASTER_KEY_BYTES) {
    throw new AiEnvironmentError(`${name} must decode to exactly ${MASTER_KEY_BYTES} bytes.`)
  }

  return decoded
}

export function getCredentialMasterKey(
  version: number,
  environment: EnvironmentSource = process.env,
) {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new AiEnvironmentError('Credential key version must be a positive safe integer.')
  }
  return parseCredentialMasterKey(
    environment[`AI_CREDENTIAL_ENCRYPTION_KEY_V${version}`],
    `AI_CREDENTIAL_ENCRYPTION_KEY_V${version}`,
  )
}

export function loadAiEnvironment(environment: EnvironmentSource = process.env): AiEnvironment {
  const featureEnabled = readBoolean(environment.AI_FEATURE_ENABLED, 'AI_FEATURE_ENABLED')
  const openAiEnabled = readBoolean(environment.AI_OPENAI_ENABLED, 'AI_OPENAI_ENABLED')
  const geminiEnabled = readBoolean(environment.AI_GEMINI_ENABLED, 'AI_GEMINI_ENABLED')
  const workspaceAnalysisEnabled = readBoolean(
    environment.AI_WORKSPACE_ANALYSIS_ENABLED,
    'AI_WORKSPACE_ANALYSIS_ENABLED',
  )

  if (!featureEnabled && (openAiEnabled || geminiEnabled || workspaceAnalysisEnabled)) {
    throw new AiEnvironmentError('AI_FEATURE_ENABLED must be true before enabling an AI sub-feature.')
  }
  if (featureEnabled) {
    getCredentialMasterKey(ACTIVE_CREDENTIAL_KEY_VERSION, environment)
  }

  return {
    featureEnabled,
    openAiEnabled,
    geminiEnabled,
    workspaceAnalysisEnabled,
    activeCredentialKeyVersion: ACTIVE_CREDENTIAL_KEY_VERSION,
  }
}

export const aiEnvironment = Object.freeze(loadAiEnvironment())
