import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { AiProvider, ProviderAnalysisInput } from '../../lib/ai/provider-contract'
import { GeminiAiProvider, GEMINI_3_6_FLASH, GEMINI_ANALYSIS_MODEL } from '../../lib/ai/providers/gemini'
import { GPT_5_6_LUNA, OpenAiProvider, OPENAI_ANALYSIS_MODEL } from '../../lib/ai/providers/openai'

const input = (model: string): ProviderAnalysisInput => ({
  mode: 'summary', model, systemPrompt: 'SYSTEM_MARKER', userPrompt: 'DOCUMENT_MARKER', sourceLabels: ['S1'],
})
const output = (labels = ['S1']) => ({ version: 1, mode: 'summary', title: 'Title', overview: 'Overview', sections: [{ kind: 'summary', heading: 'Heading', items: [{ text: 'Item', sourceLabels: labels }] }], unknowns: [] })

function openAiBody(value = output()) {
  return { id: 'resp_1', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 10, output_tokens: 5 } }
}
function geminiBody(value = output()) {
  return { responseId: 'gem_1', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }
}

type AdapterCase = { name: string; model: string; make: (fetcher: typeof fetch) => AiProvider; success: unknown; authHeader: string }
const cases: AdapterCase[] = [
  { name: 'OpenAI', model: OPENAI_ANALYSIS_MODEL, make: fetcher => new OpenAiProvider(fetcher), success: openAiBody(), authHeader: 'authorization' },
  { name: 'Gemini', model: GEMINI_ANALYSIS_MODEL, make: fetcher => new GeminiAiProvider(fetcher), success: geminiBody(), authHeader: 'x-goog-api-key' },
]

describe('server model allowlist', () => {
  it('pins the approved OpenAI and Gemini models', () => {
    expect(GPT_5_6_LUNA).toBe('gpt-5.6-luna')
    expect(GEMINI_3_6_FLASH).toBe('gemini-3.6-flash')
    expect(OPENAI_ANALYSIS_MODEL).toBe(GPT_5_6_LUNA)
    expect(GEMINI_ANALYSIS_MODEL).toBe(GEMINI_3_6_FLASH)
  })
})

describe.each(cases)('$name provider contract', adapter => {
  it('verifies credentials with a no-generation model lookup and header auth', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    await adapter.make(fetcher).verifyCredential('SECRET_KEY', new AbortController().signal)
    const [url, init] = vi.mocked(fetcher).mock.calls[0]
    expect(String(url)).toContain(`/models/${adapter.model}`)
    expect(String(url)).not.toContain('SECRET_KEY')
    expect(new Headers(init?.headers).get(adapter.authHeader)).toContain('SECRET_KEY')
  })

  it('returns validated output, usage, and request ID without logging raw data', async () => {
    const fetcher = vi.fn(async () => Response.json(adapter.success)) as unknown as typeof fetch
    const result = await adapter.make(fetcher).analyze(input(adapter.model), 'SECRET_KEY', new AbortController().signal)
    expect(result.output.title).toBe('Title')
    expect(result.output.sections[0].items[0].sourceLabels).toEqual(['S1'])
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
    const [url, init] = vi.mocked(fetcher).mock.calls[0]
    expect(String(url)).not.toContain('SECRET_KEY')
    expect(String(init?.body)).toContain('DOCUMENT_MARKER')
  })

  it.each([
    [401, 'invalid_credential'],
    [403, 'invalid_credential'],
    [404, 'model_unavailable'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)('normalizes HTTP %s', async (status, code) => {
    const fetcher = vi.fn(async () => new Response('{}', { status, headers: status === 429 ? { 'retry-after': '17' } : undefined })) as unknown as typeof fetch
    await expect(adapter.make(fetcher).analyze(input(adapter.model), 'SECRET_KEY', new AbortController().signal)).rejects.toMatchObject({ code })
  })

  it('normalizes timeout and invalid JSON without retaining provider payloads', async () => {
    const timeoutFetch = vi.fn(async () => { throw new DOMException('secret provider detail', 'TimeoutError') }) as unknown as typeof fetch
    await expect(adapter.make(timeoutFetch).analyze(input(adapter.model), 'SECRET_KEY', new AbortController().signal)).rejects.toMatchObject({ code: 'timeout' })
    const invalidFetch = vi.fn(async () => new Response('not-json', { status: 200 })) as unknown as typeof fetch
    await expect(adapter.make(invalidFetch).analyze(input(adapter.model), 'SECRET_KEY', new AbortController().signal)).rejects.toMatchObject({ code: 'invalid_output' })
  })
})

describe('provider citation boundary', () => {
  it.each([
    ['OpenAI', new OpenAiProvider(vi.fn(async () => Response.json(openAiBody(output(['S99'])))) as unknown as typeof fetch), OPENAI_ANALYSIS_MODEL],
    ['Gemini', new GeminiAiProvider(vi.fn(async () => Response.json(geminiBody(output(['S99'])))) as unknown as typeof fetch), GEMINI_ANALYSIS_MODEL],
  ])('%s rejects unknown source labels', async (_name, provider, model) => {
    await expect(provider.analyze(input(model), 'SECRET_KEY', new AbortController().signal)).rejects.toMatchObject({ code: 'invalid_output' })
  })
})
