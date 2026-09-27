import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { ApiError, apiErrorResponse } from './api-error'
import type { ApiTiming } from './timing'

const AUTH_USER_CACHE_TTL_MS = 10_000
const AUTH_USER_CACHE_MAX_SIZE = 100
const ROLE_CACHE_TTL_MS = 5_000
const ROLE_CACHE_MAX_SIZE = 200

type AuthUserResponse = Awaited<ReturnType<typeof supabaseAdmin.auth.getUser>>
type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export type AuthLookupOptions = {
  fresh?: boolean
}

export type WorkspaceRoleLookupOptions = {
  fresh?: boolean
  timing?: ApiTiming
  label?: string
}

const authUserCache = new Map<string, { user: User; expiresAt: number }>()
const authUserRequests = new Map<string, Promise<AuthUserResponse>>()
const roleCache = new Map<string, { role: WorkspaceRole; expiresAt: number }>()

function pruneRoleCache(now: number) {
  if (roleCache.size <= ROLE_CACHE_MAX_SIZE) return

  for (const [key, entry] of roleCache.entries()) {
    if (entry.expiresAt <= now) roleCache.delete(key)
  }

  while (roleCache.size > ROLE_CACHE_MAX_SIZE) {
    const oldestKey = roleCache.keys().next().value
    if (!oldestKey) break
    roleCache.delete(oldestKey)
  }
}

function pruneAuthUserCache(now: number) {
  if (authUserCache.size <= AUTH_USER_CACHE_MAX_SIZE) return

  for (const [token, entry] of authUserCache.entries()) {
    if (entry.expiresAt <= now) authUserCache.delete(token)
  }

  while (authUserCache.size > AUTH_USER_CACHE_MAX_SIZE) {
    const oldestToken = authUserCache.keys().next().value
    if (!oldestToken) break
    authUserCache.delete(oldestToken)
  }
}

async function getCachedUser(token: string, timing?: ApiTiming, fresh = false) {
  if (fresh) {
    const response = timing
      ? await timing.measure('auth.getUser.fresh', () => supabaseAdmin.auth.getUser(token))
      : await supabaseAdmin.auth.getUser(token)

    return { user: response.data.user, error: response.error }
  }

  const now = Date.now()
  const cached = authUserCache.get(token)
  if (cached && cached.expiresAt > now) {
    timing?.mark('auth.cacheHit', performance.now())
    return { user: cached.user, error: null }
  }

  authUserCache.delete(token)

  let request = authUserRequests.get(token)
  if (!request) {
    request = timing
      ? timing.measure('auth.getUser', () => supabaseAdmin.auth.getUser(token))
      : supabaseAdmin.auth.getUser(token)
    authUserRequests.set(token, request)
    request.then(
      () => authUserRequests.delete(token),
      () => authUserRequests.delete(token),
    )
  } else {
    timing?.mark('auth.inflightHit', performance.now())
  }

  const { data, error } = await request
  if (!error && data.user) {
    authUserCache.set(token, {
      user: data.user,
      expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
    })
    pruneAuthUserCache(Date.now())
  }

  return { user: data.user, error }
}

export async function getUserFromRequest(
  request: Request,
  timing?: ApiTiming,
  options: AuthLookupOptions = {},
) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1]
  if (!token || token === 'undefined') {
    return {
      user: null,
      response: apiErrorResponse(new ApiError('UNAUTHENTICATED')),
    }
  }

  const { user, error } = await getCachedUser(token, timing, options.fresh)
  if (error || !user) {
    return {
      user: null,
      response: apiErrorResponse(new ApiError('UNAUTHENTICATED')),
    }
  }

  return { user, response: null }
}

export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  roles: Array<WorkspaceRole>,
  timingOrOptions?: ApiTiming | WorkspaceRoleLookupOptions,
  legacyLabel = 'role.select',
) {
  const options: WorkspaceRoleLookupOptions = timingOrOptions && 'measure' in timingOrOptions
    ? { timing: timingOrOptions, label: legacyLabel }
    : timingOrOptions ?? {}
  const timing = options.timing
  const label = options.label ?? 'role.select'
  const cacheKey = `${userId}:${workspaceId}`
  const now = Date.now()
  const cached = options.fresh ? undefined : roleCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    timing?.mark('role.cacheHit', performance.now())
    // role 문자열을 캐싱하고 호출마다 roles와 대조한다.
    // (불리언 캐싱 시 owner-only vs owner+editor 체크가 섞임)
    return roles.includes(cached.role)
  }

  if (!options.fresh) roleCache.delete(cacheKey)

  const { data, error } = await (timing
    ? timing.measure(label, () => supabaseAdmin
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single())
    : supabaseAdmin
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single())

  if (error || !data) return false

  // 멤버인 경우에만 캐싱(비멤버 negative는 드물고 Forbidden 처리됨)
  if (!options.fresh) {
    roleCache.set(cacheKey, { role: data.role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS })
    pruneRoleCache(Date.now())
  }

  return roles.includes(data.role)
}
