export const AI_PROVIDER_ERROR_CODES = [
  'invalid_credential',
  'rate_limited',
  'timeout',
  'aborted',
  'model_unavailable',
  'provider_unavailable',
  'blocked',
  'truncated',
  'invalid_output',
] as const

export type AiProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number]

const SAFE_MESSAGES: Record<AiProviderErrorCode, string> = {
  invalid_credential: 'AI 제공자 인증에 실패했습니다.',
  rate_limited: 'AI 제공자 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
  timeout: 'AI 제공자 응답 시간이 초과되었습니다.',
  aborted: 'AI 요청이 취소되었습니다.',
  model_unavailable: '설정된 AI 모델을 이 API 프로젝트에서 사용할 수 없습니다.',
  provider_unavailable: 'AI 제공자를 일시적으로 사용할 수 없습니다.',
  blocked: 'AI 제공자가 요청 또는 응답을 차단했습니다.',
  truncated: 'AI 응답이 완성되기 전에 종료되었습니다.',
  invalid_output: 'AI 제공자가 올바르지 않은 형식으로 응답했습니다.',
}

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode
  readonly retryable: boolean
  readonly retryAfterSeconds?: number
  readonly providerStatus?: number

  constructor(
    code: AiProviderErrorCode,
    options: { retryable?: boolean; retryAfterSeconds?: number; providerStatus?: number } = {},
  ) {
    // Do not retain the provider's raw error as `cause`: callers may serialize
    // or log this normalized error at a different trust boundary.
    super(SAFE_MESSAGES[code])
    this.name = 'AiProviderError'
    this.code = code
    this.retryable = options.retryable ?? ['rate_limited', 'timeout', 'provider_unavailable'].includes(code)
    if (Number.isSafeInteger(options.retryAfterSeconds) && (options.retryAfterSeconds ?? 0) > 0) {
      this.retryAfterSeconds = options.retryAfterSeconds
    }
    if (Number.isSafeInteger(options.providerStatus) && (options.providerStatus ?? 0) >= 400) {
      this.providerStatus = options.providerStatus
    }
  }
}

export function isAiProviderError(value: unknown): value is AiProviderError {
  return value instanceof AiProviderError
}
