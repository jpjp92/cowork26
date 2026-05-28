import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabase-admin'
import { getUserFromRequest, requireWorkspaceRole } from '../../../_utils/auth'
import { createApiTiming } from '../../../_utils/timing'

type RouteContext = {
  params: Promise<{ id: string }>
}

type WorkspaceRole = 'owner' | 'editor' | 'viewer'

async function getWorkspaceId(context: RouteContext) {
  const { id } = await context.params
  return id
}

async function listUsersById() {
  const usersById = new Map<string, { email: string | null }>()
  let page = 1

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) throw error

    for (const user of data.users) {
      usersById.set(user.id, { email: user.email ?? null })
    }

    if (data.users.length < 1000) break
    page += 1
  }

  return usersById
}

export async function GET(request: Request, context: RouteContext) {
  const timing = createApiTiming('GET /api/workspaces/[id]/members')
  let memberCount = 0

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const workspaceId = await getWorkspaceId(context)
    const canRead = await requireWorkspaceRole(workspaceId, user.id, ['owner', 'editor', 'viewer'], timing)
    if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: members, error } = await timing.measure('members.select', () => supabaseAdmin
      .from('workspace_members')
      .select('user_id, role, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }))

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    memberCount = members?.length ?? 0

    try {
      const usersById = await timing.measure('auth.admin.listUsers', () => listUsersById())
      return NextResponse.json(
        (members ?? []).map(member => ({
          ...member,
          email: usersById.get(member.user_id)?.email ?? null,
        }))
      )
    } catch (listError) {
      return NextResponse.json(
        { error: listError instanceof Error ? listError.message : 'Failed to load users' },
        { status: 500 }
      )
    }
  } finally {
    timing.log({ memberCount })
  }
}

export async function POST(request: Request, context: RouteContext) {
  const timing = createApiTiming('POST /api/workspaces/[id]/members')

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const workspaceId = await getWorkspaceId(context)
    const isOwner = await requireWorkspaceRole(workspaceId, user.id, ['owner'], timing)
    if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await timing.measure('request.json', () => request.json().catch(() => ({})))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role: Exclude<WorkspaceRole, 'owner'> = body.role === 'viewer' ? 'viewer' : 'editor'

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    try {
      const usersById = await timing.measure('auth.admin.listUsers', () => listUsersById())
      const invitedUser = Array.from(usersById.entries()).find(([, value]) => value.email?.toLowerCase() === email)

      if (!invitedUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const [invitedUserId] = invitedUser

      const { error } = await timing.measure('member.upsert', () => supabaseAdmin
        .from('workspace_members')
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: invitedUserId,
            role,
          },
          { onConflict: 'workspace_id,user_id' }
        ))

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json(
        {
          workspace_id: workspaceId,
          user_id: invitedUserId,
          email,
          role,
        },
        { status: 201 }
      )
    } catch (listError) {
      return NextResponse.json(
        { error: listError instanceof Error ? listError.message : 'Failed to load users' },
        { status: 500 }
      )
    }
  } finally {
    timing.log()
  }
}
