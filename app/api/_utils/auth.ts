import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import type { ApiTiming } from './timing'

const AUTH_USER_CACHE_TTL_MS = 10_000
const AUTH_USER_CACHE_MAX_SIZE = 100

type AuthUserResponse = Awaited<ReturnType<typeof supabaseAdmin.auth.getUser>>

const authUserCache = new Map<string, { user: User; expiresAt: number }>()
const authUserRequests = new Map<string, Promise<AuthUserResponse>>()

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

async function getCachedUser(token: string, timing?: ApiTiming) {
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

export async function getUserFromRequest(request: Request, timing?: ApiTiming) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token || token === 'undefined') {
    return {
      user: null,
      response: NextResponse.json({ error: 'Missing access token' }, { status: 401 }),
    }
  }

  const { user, error } = await getCachedUser(token, timing)
  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: error?.message ?? 'Invalid access token' },
        { status: 401 }
      ),
    }
  }

  return { user, response: null }
}

export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  roles: Array<'owner' | 'editor' | 'viewer'>,
  timing?: ApiTiming,
  label = 'role.select',
) {
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

  if (error || !data || !roles.includes(data.role)) return false
  return true
}
