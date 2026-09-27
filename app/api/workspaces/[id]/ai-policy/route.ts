import { NextResponse } from 'next/server'
import { isUuid } from '../../../../../lib/image-assets'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'
import { ApiError, apiErrorResponse } from '../../../_utils/api-error'
import { getUserFromRequest, requireWorkspaceRole } from '../../../_utils/auth'
import { readBoundedJson } from '../../../_utils/request-body'

const MAX_POLICY_BODY_BYTES = 2 * 1024
const ALLOWED_PROVIDERS = new Set(['openai', 'gemini'])
const ALLOWED_ROLES = new Set(['owner', 'editor'])

type RouteContext = { params: Promise<{ id: string }> }
type PolicyBody = {
  enabled?: unknown
  allowedProviders?: unknown
  allowedRoles?: unknown
}

function noStore(response: Response) {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function safeError(error: unknown) {
  return noStore(apiErrorResponse(error))
}

async function workspaceIdFrom(context: RouteContext) {
  const { id } = await context.params
  if (!isUuid(id)) throw new ApiError('VALIDATION_ERROR')
  return id
}

function parseStringAllowlist(value: unknown, allowed: ReadonlySet<string>) {
  if (!Array.isArray(value) || value.length === 0 || value.length > allowed.size) {
    throw new ApiError('VALIDATION_ERROR')
  }
  const result = value.map(item => {
    if (typeof item !== 'string' || !allowed.has(item)) throw new ApiError('VALIDATION_ERROR')
    return item
  })
  if (new Set(result).size !== result.length) throw new ApiError('VALIDATION_ERROR')
  return result
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, response } = await getUserFromRequest(request, undefined, { fresh: true })
    if (!user) return noStore(response)
    const workspaceId = await workspaceIdFrom(context)
    const isMember = await requireWorkspaceRole(
      workspaceId,
      user.id,
      ['owner', 'editor', 'viewer'],
      { fresh: true },
    )
    if (!isMember) throw new ApiError('FORBIDDEN')

    const { data, error } = await supabaseAdmin
      .from('workspace_ai_policies')
      .select('enabled, allowed_providers, allowed_roles, updated_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error) throw new Error('Workspace AI policy lookup failed.')

    return noStore(NextResponse.json({
      workspaceId,
      enabled: data?.enabled ?? false,
      allowedProviders: data?.allowed_providers ?? ['openai', 'gemini'],
      allowedRoles: data?.allowed_roles ?? ['owner', 'editor'],
      updatedAt: data?.updated_at ?? null,
    }))
  } catch (error) {
    return safeError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, response } = await getUserFromRequest(request, undefined, { fresh: true })
    if (!user) return noStore(response)
    const workspaceId = await workspaceIdFrom(context)
    const isOwner = await requireWorkspaceRole(workspaceId, user.id, ['owner'], { fresh: true })
    if (!isOwner) throw new ApiError('FORBIDDEN')
    const body = await readBoundedJson<PolicyBody>(request, MAX_POLICY_BODY_BYTES)
    if (typeof body?.enabled !== 'boolean') throw new ApiError('VALIDATION_ERROR')
    const allowedProviders = parseStringAllowlist(body.allowedProviders, ALLOWED_PROVIDERS)
    const allowedRoles = parseStringAllowlist(body.allowedRoles, ALLOWED_ROLES)

    const { data, error } = await supabaseAdmin
      .from('workspace_ai_policies')
      .upsert({
        workspace_id: workspaceId,
        enabled: body.enabled,
        allowed_providers: allowedProviders,
        allowed_roles: allowedRoles,
        updated_by: user.id,
      }, { onConflict: 'workspace_id' })
      .select('enabled, allowed_providers, allowed_roles, updated_at')
      .single()
    if (error || !data) throw new Error('Workspace AI policy write failed.')

    return noStore(NextResponse.json({
      workspaceId,
      enabled: data.enabled,
      allowedProviders: data.allowed_providers,
      allowedRoles: data.allowed_roles,
      updatedAt: data.updated_at,
    }))
  } catch (error) {
    return safeError(error)
  }
}
