import 'server-only'

import { ANALYSIS_OUTPUT_JSON_SCHEMA } from '../analysis-json-schema'
import type { AiProvider, ProviderAnalysisInput } from '../provider-contract'
import { AiProviderError } from '../provider-errors'
import { parseAnalysisOutput } from '../output-schema'
import { normalizeFetchError, providerSignal, safeJson, throwProviderHttpError } from './provider-http'

export const GPT_5_6_LUNA = 'gpt-5.6-luna'
export const OPENAI_ANALYSIS_MODEL = GPT_5_6_LUNA
const API_ROOT = 'https://api.openai.com/v1'

type Fetch = typeof fetch

export class OpenAiProvider implements AiProvider {
  constructor(private readonly fetchImpl: Fetch = fetch, private readonly timeoutMs?: number) {}

  private headers(apiKey: string) {
    return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  }

  async verifyCredential(apiKey: string, signal: AbortSignal) {
    let response: Response
    try {
      response = await this.fetchImpl(`${API_ROOT}/models/${OPENAI_ANALYSIS_MODEL}`, { headers: this.headers(apiKey), signal: providerSignal(signal, this.timeoutMs) })
    } catch (error) { normalizeFetchError(error, signal) }
    if (!response.ok) throwProviderHttpError(response)
    return { valid: true as const, accountLabel: 'OpenAI' }
  }

  async analyze(input: ProviderAnalysisInput, apiKey: string, signal: AbortSignal) {
    if (input.model !== OPENAI_ANALYSIS_MODEL) throw new AiProviderError('provider_unavailable')
    let response: Response
    try {
      response = await this.fetchImpl(`${API_ROOT}/responses`, {
        method: 'POST', headers: this.headers(apiKey), signal: providerSignal(signal, this.timeoutMs),
        body: JSON.stringify({
          model: OPENAI_ANALYSIS_MODEL,
          reasoning: { effort: 'low' },
          instructions: input.systemPrompt,
          input: input.userPrompt,
          max_output_tokens: 8_000,
          store: false,
          text: { format: { type: 'json_schema', name: 'workspace_analysis', strict: true, schema: ANALYSIS_OUTPUT_JSON_SCHEMA } },
        }),
      })
    } catch (error) { normalizeFetchError(error, signal) }
    if (!response.ok) throwProviderHttpError(response)
    const body = await safeJson(response) as Record<string, unknown>
    if (body.status === 'incomplete') throw new AiProviderError('truncated')
    if (body.status !== 'completed') throw new AiProviderError('provider_unavailable')
    const output = Array.isArray(body.output) ? body.output : []
    const contents = output.flatMap(item => item && typeof item === 'object' && Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [])
    if (contents.some(item => item && typeof item === 'object' && (item as { type?: unknown }).type === 'refusal')) throw new AiProviderError('blocked')
    const text = contents.find(item => item && typeof item === 'object' && (item as { type?: unknown }).type === 'output_text') as { text?: unknown } | undefined
    if (typeof text?.text !== 'string') throw new AiProviderError('invalid_output')
    let parsed: unknown
    try { parsed = JSON.parse(text.text) } catch { throw new AiProviderError('invalid_output') }
    const usage = body.usage && typeof body.usage === 'object' ? body.usage as Record<string, unknown> : {}
    return {
      output: parseAnalysisOutput(parsed, input.mode, input.sourceLabels),
      usage: { inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined, outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined },
      requestId: typeof body.id === 'string' ? body.id : undefined,
    }
  }
}
