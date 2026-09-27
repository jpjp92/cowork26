import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'PAGE_REVISION_CONFLICT'
  | 'AI_PROVIDER_AUTH_FAILED'
  | 'AI_RATE_LIMITED'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_REQUEST_TIMEOUT'
  | 'INTERNAL_ERROR'

const ERROR_CONTRACT: Record<ApiErrorCode, { status: number; message: string }> = {
  INVALID_JSON: { status: 400, message: 'Request body must be valid JSON.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body is too large.' },
  VALIDATION_ERROR: { status: 422, message: 'Request validation failed.' },
  PAGE_REVISION_CONFLICT: { status: 409, message: 'The page changed before this save completed.' },
  AI_PROVIDER_AUTH_FAILED: { status: 422, message: 'The AI provider rejected this credential.' },
  AI_RATE_LIMITED: { status: 429, message: 'Too many AI credential verification attempts.' },
  AI_MODEL_UNAVAILABLE: { status: 422, message: 'The configured AI model is unavailable for this API project.' },
  AI_PROVIDER_UNAVAILABLE: { status: 503, message: 'The AI provider is unavailable.' },
  AI_REQUEST_TIMEOUT: { status: 504, message: 'The AI provider request timed out.' },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode) {
    super(ERROR_CONTRACT[code].message)
    this.name = 'ApiError'
    this.code = code
    this.status = ERROR_CONTRACT[code].status
  }
}

export function serializeApiError(error: unknown, requestId = crypto.randomUUID()) {
  const normalized = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR')

  return {
    status: normalized.status,
    body: {
      error: {
        code: normalized.code,
        message: normalized.message,
        requestId,
      },
    },
  }
}

export function apiErrorResponse(error: unknown, requestId?: string) {
  const serialized = serializeApiError(error, requestId)
  return NextResponse.json(serialized.body, { status: serialized.status })
}
