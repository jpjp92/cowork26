export const AI_PROVIDERS = ['openai', 'gemini'] as const

export type AiProviderId = (typeof AI_PROVIDERS)[number]

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && AI_PROVIDERS.includes(value as AiProviderId)
}

