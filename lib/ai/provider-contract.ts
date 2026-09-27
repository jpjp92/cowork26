import type { AnalysisMode, StructuredAnalysisOutput } from './output-schema'

export type CredentialCheck = {
  valid: true
  accountLabel?: string
}

export type AnalysisUsage = {
  inputTokens?: number
  outputTokens?: number
}

export type ProviderAnalysisInput = {
  mode: AnalysisMode
  model: string
  systemPrompt: string
  userPrompt: string
  sourceLabels: readonly string[]
}

export type ProviderAnalysisResult = {
  output: StructuredAnalysisOutput
  usage: AnalysisUsage
  requestId?: string
}

export interface AiProvider {
  verifyCredential(apiKey: string, signal: AbortSignal): Promise<CredentialCheck>
  analyze(input: ProviderAnalysisInput, apiKey: string, signal: AbortSignal): Promise<ProviderAnalysisResult>
}
