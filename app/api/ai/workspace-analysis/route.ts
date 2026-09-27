import { NextResponse } from 'next/server'
import { ApiError, apiErrorResponse } from '../../_utils/api-error'
import { getUserFromRequest } from '../../_utils/auth'
import { readBoundedJson } from '../../_utils/request-body'
import { AnalysisServiceError, presentAnalysisResult, runWorkspaceAnalysis } from '../../../../lib/ai/analysis-service'
import { DocumentSourceError } from '../../../../lib/ai/document-source'
import { isAiProviderError } from '../../../../lib/ai/provider-errors'

const MAX_BODY_BYTES = 8 * 1024
function noStore(response: Response) { response.headers.set('Cache-Control', 'no-store'); return response }
function normalizeError(error: unknown) {
  if (error instanceof AnalysisServiceError) {
    if (error.code === 'FORBIDDEN') return new ApiError('FORBIDDEN')
    if (error.code === 'CREDENTIAL_MISSING') return new ApiError('AI_PROVIDER_AUTH_FAILED')
    return new ApiError('VALIDATION_ERROR')
  }
  if (error instanceof DocumentSourceError) return new ApiError(error.code === 'FORBIDDEN' ? 'FORBIDDEN' : error.code === 'SOURCE_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR')
  if (isAiProviderError(error)) {
    if (error.code === 'invalid_credential') return new ApiError('AI_PROVIDER_AUTH_FAILED')
    if (error.code === 'rate_limited') return new ApiError('AI_RATE_LIMITED')
    if (error.code === 'timeout') return new ApiError('AI_REQUEST_TIMEOUT')
    if (error.code === 'aborted') return new ApiError('VALIDATION_ERROR')
    return new ApiError('AI_PROVIDER_UNAVAILABLE')
  }
  return error
}

export async function POST(request: Request) {
  try {
    const { user, response } = await getUserFromRequest(request, undefined, { fresh: true })
    if (!user) return noStore(response)
    const body = await readBoundedJson<Record<string, unknown>>(request, MAX_BODY_BYTES)
    const result = await runWorkspaceAnalysis({
      workspaceId: body.workspaceId as string,
      userId: user.id,
      pageIds: Array.isArray(body.pageIds) ? body.pageIds as string[] : [],
      provider: body.provider,
      mode: body.mode,
      additionalRequest: body.additionalRequest,
      idempotencyKey: body.idempotencyKey,
      signal: request.signal,
    })
    return noStore(NextResponse.json(presentAnalysisResult(result)))
  } catch (error) {
    return noStore(apiErrorResponse(normalizeError(error)))
  }
}
