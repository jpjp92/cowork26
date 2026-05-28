import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import type { ApiTiming } from './timing'

export async function getUserFromRequest(request: Request, timing?: ApiTiming) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token || token === 'undefined') {
    return {
      user: null,
      response: NextResponse.json({ error: 'Missing access token' }, { status: 401 }),
    }
  }

  const { data, error } = await (timing
    ? timing.measure('auth.getUser', () => supabaseAdmin.auth.getUser(token))
    : supabaseAdmin.auth.getUser(token))
  if (error || !data.user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: error?.message ?? 'Invalid access token' },
        { status: 401 }
      ),
    }
  }

  return { user: data.user, response: null }
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
