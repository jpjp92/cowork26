import { NextResponse } from 'next/server'
import { ApiError, apiErrorResponse } from '../../../_utils/api-error'
import { getUserFromRequest } from '../../../_utils/auth'
import { AnalysisServiceError, getAnalysisRequest } from '../../../../../lib/ai/analysis-service'
import { isUuid } from '../../../../../lib/image-assets'

type RouteContext = { params: Promise<{ id: string }> }
function noStore(response: Response) { response.headers.set('Cache-Control', 'no-store'); return response }

export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, response } = await getUserFromRequest(request, undefined, { fresh: true })
    if (!user) return noStore(response)
    const { id } = await context.params
    if (!isUuid(id)) throw new ApiError('VALIDATION_ERROR')
    return noStore(NextResponse.json(await getAnalysisRequest(user.id, id)))
  } catch (error) {
    return noStore(apiErrorResponse(error instanceof AnalysisServiceError ? new ApiError('FORBIDDEN') : error))
  }
}
