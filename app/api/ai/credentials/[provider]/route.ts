import { NextResponse } from 'next/server'
import { ApiError, apiErrorResponse } from '../../../_utils/api-error'
import { getUserFromRequest } from '../../../_utils/auth'
import { readBoundedJson } from '../../../_utils/request-body'
import {
  deleteCredential,
  getCredentialStatus,
  verifyAndStoreCredential,
} from '../../../../../lib/ai/credential-service'
import { credentialVerifyRateLimiter } from '../../../../../lib/ai/credential-rate-limit'
import { isAiProviderError } from '../../../../../lib/ai/provider-errors'
import { isAiProviderId } from '../../../../../lib/ai/providers'

const MAX_CREDENTIAL_BODY_BYTES = 10 * 1024
type RouteContext = { params: Promise<{ provider: string }> }

function noStore(response: Response) {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function safeErrorResponse(error: unknown) {
  if (isAiProviderError(error)) {
    const code = error.code === 'invalid_credential'
      ? 'AI_PROVIDER_AUTH_FAILED'
      : error.code === 'rate_limited'
        ? 'AI_RATE_LIMITED'
        : error.code === 'timeout'
          ? 'AI_REQUEST_TIMEOUT'
          : 'AI_PROVIDER_UNAVAILABLE'
    const response = apiErrorResponse(new ApiError(code))
    if (error.retryAfterSeconds) response.headers.set('Retry-After', String(error.retryAfterSeconds))
    return noStore(response)
  }
  return noStore(apiErrorResponse(error))
}

async function authenticate(request: Request) {
  return getUserFromRequest(request, undefined, { fresh: true })
}

async function providerFrom(context: RouteContext) {
  const { provider } = await context.params
  if (!isAiProviderId(provider)) throw new ApiError('VALIDATION_ERROR')
  return provider
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, response } = await authenticate(request)
    if (!user) return noStore(response)
    const provider = await providerFrom(context)
    return noStore(NextResponse.json(await getCredentialStatus(user.id, provider)))
  } catch (error) {
    return safeErrorResponse(error)
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { user, response } = await authenticate(request)
    if (!user) return noStore(response)
    const body = await readBoundedJson<{ apiKey?: unknown }>(request, MAX_CREDENTIAL_BODY_BYTES)
    const provider = await providerFrom(context)
    const rateLimit = credentialVerifyRateLimiter.consume(user.id)
    if (!rateLimit.allowed) {
      const response = apiErrorResponse(new ApiError('AI_RATE_LIMITED'))
      response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds))
      return noStore(response)
    }
    const status = await verifyAndStoreCredential({
      userId: user.id,
      provider,
      apiKey: body?.apiKey,
      signal: request.signal,
    })
    return noStore(NextResponse.json(status))
  } catch (error) {
    if (error instanceof TypeError) return noStore(apiErrorResponse(new ApiError('VALIDATION_ERROR')))
    return safeErrorResponse(error)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { user, response } = await authenticate(request)
    if (!user) return noStore(response)
    const provider = await providerFrom(context)
    await deleteCredential(user.id, provider)
    return noStore(new NextResponse(null, { status: 204 }))
  } catch (error) {
    return safeErrorResponse(error)
  }
}
