import 'server-only'

import type { AiProvider } from './provider-contract'
import type { AiProviderId } from './providers'
import { GeminiAiProvider, GEMINI_ANALYSIS_MODEL } from './providers/gemini'
import { OpenAiProvider, OPENAI_ANALYSIS_MODEL } from './providers/openai'

export function getAiProvider(provider: AiProviderId): AiProvider {
  return provider === 'openai' ? new OpenAiProvider() : new GeminiAiProvider()
}

export function getAiAnalysisModel(provider: AiProviderId) {
  return provider === 'openai' ? OPENAI_ANALYSIS_MODEL : GEMINI_ANALYSIS_MODEL
}
