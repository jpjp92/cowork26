import 'server-only'

import { ANALYSIS_OUTPUT_JSON_SCHEMA } from '../analysis-json-schema'
import type { AiProvider, ProviderAnalysisInput } from '../provider-contract'
import { AiProviderError } from '../provider-errors'
import { parseAnalysisOutput } from '../output-schema'
import { normalizeFetchError, providerSignal, safeJson, throwProviderHttpError } from './provider-http'

export const GEMINI_3_6_FLASH = 'gemini-3.6-flash'
export const GEMINI_ANALYSIS_MODEL = GEMINI_3_6_FLASH
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta'
type Fetch = typeof fetch

export class GeminiAiProvider implements AiProvider {
  constructor(private readonly fetchImpl: Fetch = fetch, private readonly timeoutMs?: number) {}
  private headers(apiKey: string) { return { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' } }

  async verifyCredential(apiKey: string, signal: AbortSignal) {
    let response: Response
    try {
      response = await this.fetchImpl(`${API_ROOT}/models/${GEMINI_ANALYSIS_MODEL}`, { headers: this.headers(apiKey), signal: providerSignal(signal, this.timeoutMs) })
    } catch (error) { normalizeFetchError(error, signal) }
    if (!response.ok) throwProviderHttpError(response)
    return { valid: true as const, accountLabel: 'Gemini' }
  }

  async analyze(input: ProviderAnalysisInput, apiKey: string, signal: AbortSignal) {
    if (input.model !== GEMINI_ANALYSIS_MODEL) throw new AiProviderError('provider_unavailable')
    let response: Response
    try {
      response = await this.fetchImpl(`${API_ROOT}/models/${GEMINI_ANALYSIS_MODEL}:generateContent`, {
        method: 'POST', headers: this.headers(apiKey), signal: providerSignal(signal, this.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }],
          generationConfig: { maxOutputTokens: 8_000, responseFormat: { text: { mimeType: 'application/json', schema: ANALYSIS_OUTPUT_JSON_SCHEMA } } },
        }),
      })
    } catch (error) { normalizeFetchError(error, signal) }
    if (!response.ok) throwProviderHttpError(response)
    const body = await safeJson(response) as Record<string, unknown>
    const candidates = Array.isArray(body.candidates) ? body.candidates as Array<Record<string, unknown>> : []
    const candidate = candidates[0]
    const finishReason = candidate?.finishReason
    if (finishReason === 'MAX_TOKENS') throw new AiProviderError('truncated')
    if (['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(String(finishReason))) throw new AiProviderError('blocked')
    const content = candidate?.content && typeof candidate.content === 'object' ? candidate.content as Record<string, unknown> : {}
    const parts = Array.isArray(content.parts) ? content.parts as Array<Record<string, unknown>> : []
    const text = parts.map(part => typeof part.text === 'string' ? part.text : '').join('')
    if (!text) throw new AiProviderError('invalid_output')
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { throw new AiProviderError('invalid_output') }
    const usage = body.usageMetadata && typeof body.usageMetadata === 'object' ? body.usageMetadata as Record<string, unknown> : {}
    return {
      output: parseAnalysisOutput(parsed, input.mode, input.sourceLabels),
      usage: { inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : undefined, outputTokens: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : undefined },
      requestId: typeof body.responseId === 'string' ? body.responseId : undefined,
    }
  }
}
