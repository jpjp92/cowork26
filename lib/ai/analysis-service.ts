import 'server-only'

import { createHash } from 'node:crypto'
import { supabaseAdmin } from '../supabase-admin'
import { decryptCredential } from './credential-crypto'
import { loadVerifiedDocumentSources } from './document-source'
import { aiEnvironment } from './env'
import { buildAnalysisPrompt } from './prompt-builder'
import type { AiProvider } from './provider-contract'
import { AiProviderError, isAiProviderError } from './provider-errors'
import { isAiProviderId, type AiProviderId } from './providers'
import { getAiAnalysisModel, getAiProvider } from './provider-factory'
import { isAnalysisMode, type AnalysisMode, type StructuredAnalysisOutput } from './output-schema'

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,128}$/

type CredentialRow = { ciphertext: string; nonce: string; auth_tag: string; key_version: number }
type MemberPolicy = { role: string; enabled: boolean; allowedProviders: string[]; allowedRoles: string[] }

export class AnalysisServiceError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'FORBIDDEN' | 'CREDENTIAL_MISSING' | 'DUPLICATE') {
    super(code)
    this.name = 'AnalysisServiceError'
  }
}

async function requireAllowed(workspaceId: string, userId: string, provider: AiProviderId): Promise<MemberPolicy> {
  const [{ data: member, error: memberError }, { data: policy, error: policyError }] = await Promise.all([
    supabaseAdmin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('workspace_ai_policies').select('enabled, allowed_providers, allowed_roles').eq('workspace_id', workspaceId).maybeSingle(),
  ])
  if (memberError || policyError) throw new Error('Analysis authorization lookup failed.')
  const allowedProviders = policy?.allowed_providers ?? []
  const allowedRoles = policy?.allowed_roles ?? []
  if (!member || policy?.enabled !== true || !allowedProviders.includes(provider) || !allowedRoles.includes(member.role)) {
    throw new AnalysisServiceError('FORBIDDEN')
  }
  return { role: member.role, enabled: true, allowedProviders, allowedRoles }
}

function ledgerErrorCode(error: unknown) {
  if (!isAiProviderError(error)) return 'internal_error'
  if (error.code === 'invalid_credential') return 'invalid_credential'
  if (error.code === 'rate_limited') return 'rate_limited'
  if (error.code === 'timeout') return 'timeout'
  if (error.code === 'provider_unavailable') return 'provider_unavailable'
  if (error.code === 'model_unavailable') return 'provider_unavailable'
  if (error.code === 'invalid_output' || error.code === 'blocked' || error.code === 'truncated') return 'invalid_output'
  return 'internal_error'
}

async function finishRequest(id: string, values: Record<string, unknown>) {
  await supabaseAdmin.from('ai_analysis_requests').update({ ...values, completed_at: new Date().toISOString() }).eq('id', id)
}

export async function runWorkspaceAnalysis(input: {
  workspaceId: string
  userId: string
  pageIds: string[]
  provider: unknown
  mode: unknown
  additionalRequest?: unknown
  idempotencyKey: unknown
  signal: AbortSignal
  analysisProvider?: AiProvider
}) {
  if (!isAiProviderId(input.provider) || !isAnalysisMode(input.mode)) throw new AnalysisServiceError('INVALID_REQUEST')
  if (typeof input.additionalRequest !== 'string' || typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY_RE.test(input.idempotencyKey)) {
    throw new AnalysisServiceError('INVALID_REQUEST')
  }
  if (!aiEnvironment.featureEnabled || !aiEnvironment.workspaceAnalysisEnabled) throw new AiProviderError('provider_unavailable')
  const providerEnabled = input.provider === 'openai' ? aiEnvironment.openAiEnabled : aiEnvironment.geminiEnabled
  if (!providerEnabled) throw new AiProviderError('provider_unavailable')

  await requireAllowed(input.workspaceId, input.userId, input.provider)
  const { data: credential, error: credentialError } = await supabaseAdmin
    .from('user_ai_credentials').select('ciphertext, nonce, auth_tag, key_version')
    .eq('user_id', input.userId).eq('provider', input.provider).maybeSingle<CredentialRow>()
  if (credentialError) throw new Error('Analysis credential lookup failed.')
  if (!credential) throw new AnalysisServiceError('CREDENTIAL_MISSING')
  const apiKey = decryptCredential({ ciphertext: credential.ciphertext, nonce: credential.nonce, authTag: credential.auth_tag, keyVersion: credential.key_version }, { userId: input.userId, provider: input.provider })

  const sources = await loadVerifiedDocumentSources({ workspaceId: input.workspaceId, userId: input.userId, pageIds: input.pageIds })
  const prompt = buildAnalysisPrompt({ mode: input.mode, sources: sources.providerSources, additionalRequest: input.additionalRequest })
  const idempotencyHash = createHash('sha256').update(input.idempotencyKey, 'utf8').digest('hex')

  const { data: existing, error: existingError } = await supabaseAdmin.from('ai_analysis_requests').select('id').eq('created_by', input.userId).eq('idempotency_key_hash', idempotencyHash).maybeSingle()
  if (existingError) throw new Error('Analysis idempotency lookup failed.')
  if (existing) throw new AnalysisServiceError('DUPLICATE')

  const { data: ledger, error: ledgerError } = await supabaseAdmin.from('ai_analysis_requests').insert({
    workspace_id: input.workspaceId,
    created_by: input.userId,
    provider: input.provider,
    analysis_type: input.mode,
    prompt_template_version: 1,
    prompt_hash: prompt.metadata.promptHash,
    idempotency_key_hash: idempotencyHash,
    source_count: sources.metadata.length,
    source_bytes: sources.totalBytes,
  }).select('id').single()
  if (ledgerError || !ledger) {
    if ((ledgerError as { code?: string } | null)?.code === '23505') throw new AnalysisServiceError('DUPLICATE')
    throw new Error('Analysis request write failed.')
  }
  const requestId = ledger.id as string
  const sourceRows = sources.metadata.map((source, index) => ({ request_id: requestId, page_id: source.pageId, content_revision: source.contentRevision, source_label: source.label, source_order: index, normalized_bytes: source.normalizedBytes }))
  const { error: sourceError } = await supabaseAdmin.from('ai_analysis_sources').insert(sourceRows)
  if (sourceError) {
    await supabaseAdmin.from('ai_analysis_requests').delete().eq('id', requestId)
    throw new Error('Analysis source write failed.')
  }

  await supabaseAdmin.from('ai_analysis_requests').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', requestId)
  try {
    // Close the time-of-check/time-of-use window immediately before transmission.
    await requireAllowed(input.workspaceId, input.userId, input.provider)
    if (input.signal.aborted) throw new AiProviderError('aborted')
    const provider = input.analysisProvider ?? getAiProvider(input.provider)
    const analyzed = await provider.analyze({ mode: input.mode, model: getAiAnalysisModel(input.provider), systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, sourceLabels: prompt.sourceLabels }, apiKey, input.signal)
    await finishRequest(requestId, { status: 'succeeded', provider_request_id: analyzed.requestId ?? null, usage_input_tokens: analyzed.usage.inputTokens ?? null, usage_output_tokens: analyzed.usage.outputTokens ?? null })
    await supabaseAdmin.from('user_ai_credentials').update({ last_used_at: new Date().toISOString() }).eq('user_id', input.userId).eq('provider', input.provider)
    return {
      requestId,
      provider: input.provider,
      output: analyzed.output,
      sources: sources.metadata.map(source => ({ label: source.label, pageId: source.pageId, pageTitle: source.pageTitle })),
    }
  } catch (error) {
    if (isAiProviderError(error) && error.code === 'aborted') await finishRequest(requestId, { status: 'cancelled' })
    else await finishRequest(requestId, { status: 'failed', error_code: ledgerErrorCode(error) })
    throw error
  }
}

export function presentAnalysisResult(result: {
  requestId: string
  provider: AiProviderId
  output: StructuredAnalysisOutput
  sources: Array<{ label: string; pageId: string; pageTitle: string }>
}) {
  const sourcesByLabel = Object.fromEntries(result.sources.map(source => [source.label, source]))
  const item = (value: { text: string; sourceLabels: string[] }) => ({
    text: value.text,
    citations: value.sourceLabels.map(label => sourcesByLabel[label]).filter(Boolean),
  })
  return {
    requestId: result.requestId,
    status: 'succeeded' as const,
    provider: result.provider,
    title: result.output.title,
    overview: result.output.overview,
    sources: result.sources,
    sections: result.output.sections.map(section => ({ ...section, items: section.items.map(item) })),
    unknowns: result.output.unknowns.map(item),
  }
}

export async function getAnalysisRequest(userId: string, requestId: string) {
  const { data, error } = await supabaseAdmin.from('ai_analysis_requests').select('id, workspace_id, provider, status, analysis_type, source_count, source_bytes, error_code, created_at, completed_at').eq('id', requestId).eq('created_by', userId).maybeSingle()
  if (error) throw new Error('Analysis request lookup failed.')
  if (!data) throw new AnalysisServiceError('FORBIDDEN')
  await requireAllowed(data.workspace_id, userId, data.provider)
  return data
}
