import 'server-only'

import type { AiProvider, ProviderAnalysisInput } from '../provider-contract'
import { AiProviderError } from '../provider-errors'
import { parseAnalysisOutput } from '../output-schema'

export const FAKE_PROVIDER_KEYS = {
  success: 'fake-success',
  invalid: 'fake-invalid',
  timeout: 'fake-timeout',
  rateLimited: 'fake-rate-limited',
  malformed: 'fake-malformed',
} as const

function checkSignal(signal: AbortSignal) {
  if (signal.aborted) throw new AiProviderError('aborted')
}

function scenario(apiKey: string): keyof typeof FAKE_PROVIDER_KEYS {
  const match = Object.entries(FAKE_PROVIDER_KEYS).find(([, key]) => key === apiKey)
  return (match?.[0] as keyof typeof FAKE_PROVIDER_KEYS | undefined) ?? 'invalid'
}

function throwScenario(name: keyof typeof FAKE_PROVIDER_KEYS) {
  if (name === 'invalid') throw new AiProviderError('invalid_credential', { retryable: false })
  if (name === 'timeout') throw new AiProviderError('timeout')
  if (name === 'rateLimited') throw new AiProviderError('rate_limited', { retryAfterSeconds: 30 })
}

export class FakeAiProvider implements AiProvider {
  async verifyCredential(apiKey: string, signal: AbortSignal) {
    checkSignal(signal)
    const selected = scenario(apiKey)
    throwScenario(selected)
    if (selected === 'malformed') throw new AiProviderError('invalid_credential', { retryable: false })
    return { valid: true as const, accountLabel: 'fake-account' }
  }

  async analyze(input: ProviderAnalysisInput, apiKey: string, signal: AbortSignal) {
    checkSignal(signal)
    const selected = scenario(apiKey)
    throwScenario(selected)
    const label = input.sourceLabels[0]
    const candidate: unknown = selected === 'malformed'
      ? { version: 1, mode: input.mode, title: 'broken' }
      : {
          version: 1,
          mode: input.mode,
          title: 'Fake analysis',
          overview: 'Deterministic fake provider result.',
          sections: [{
            kind: input.mode,
            heading: 'Result',
            items: [{ text: 'Verified source-based result.', sourceLabels: label ? [label] : [] }],
          }],
          unknowns: [],
        }

    return {
      output: parseAnalysisOutput(candidate, input.mode, input.sourceLabels),
      usage: { inputTokens: 100, outputTokens: 40 },
      requestId: 'fake-request-0001',
    }
  }
}
