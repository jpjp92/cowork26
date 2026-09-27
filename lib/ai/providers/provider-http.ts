import { AiProviderError } from '../provider-errors'

export const PROVIDER_TIMEOUT_MS = 60_000

export function providerSignal(signal: AbortSignal, timeoutMs = PROVIDER_TIMEOUT_MS) {
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
}

export function normalizeFetchError(error: unknown, callerSignal: AbortSignal): never {
  if (callerSignal.aborted) throw new AiProviderError('aborted')
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    throw new AiProviderError('timeout')
  }
  throw new AiProviderError('provider_unavailable')
}

export function throwProviderHttpError(response: Response): never {
  if (response.status === 401 || response.status === 403) {
    throw new AiProviderError('invalid_credential', { retryable: false, providerStatus: response.status })
  }
  if (response.status === 404) {
    throw new AiProviderError('model_unavailable', { retryable: false, providerStatus: response.status })
  }
  if (response.status === 429) {
    const seconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
    throw new AiProviderError('rate_limited', {
      retryAfterSeconds: Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined,
      providerStatus: response.status,
    })
  }
  throw new AiProviderError('provider_unavailable', { providerStatus: response.status })
}

export async function safeJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    throw new AiProviderError('invalid_output')
  }
}
