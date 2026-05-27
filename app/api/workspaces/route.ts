import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { getUserFromRequest, requireWorkspaceRole } from '../_utils/auth'

export async function GET(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('workspace_id, role, order_index')
    .eq('user_id', user.id)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 })
  }

  const workspaceIds = memberships?.map(row => row.workspace_id) ?? []
  if (workspaceIds.length === 0) return NextResponse.json([])

  const { data: workspaces, error } = await supabaseAdmin
    .from('workspaces')
    .select('id, name, created_by, created_at')
    .in('id', workspaceIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const roleByWorkspace = new Map(memberships?.map(row => [row.workspace_id, row.role]))
  const orderByWorkspace = new Map(memberships?.map((row, index) => [row.workspace_id, row.order_index ?? index]))
  return NextResponse.json(
    workspaces?.map(workspace => ({
      ...workspace,
      role: roleByWorkspace.get(workspace.id) ?? 'viewer',
      order_index: orderByWorkspace.get(workspace.id) ?? 0,
    })).sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)) ?? []
  )
}

export async function POST(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim()
    : '새 워크스페이스'

  const { data: workspace, error } = await supabaseAdmin
    .from('workspaces')
    .insert({ name, created_by: user.id })
    .select('id, name, created_by, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: lastMembership } = await supabaseAdmin
    .from('workspace_members')
    .select('order_index')
    .eq('user_id', user.id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error: memberError } = await supabaseAdmin
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
      order_index: typeof lastMembership?.order_index === 'number' ? lastMembership.order_index + 1 : 0,
    })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  const { data: page, error: pageError } = await supabaseAdmin
    .from('pages')
    .insert({
      workspace_id: workspace.id,
      title: 'Welcome',
      order_index: 0,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Welcome to Cowork26' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '이 페이지에서 팀 문서를 정리해보세요.' }],
          },
        ],
      },
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id, workspace_id, parent_id, title, order_index, content, created_by, updated_by, created_at, updated_at')
    .single()

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 })

  return NextResponse.json({ workspace: { ...workspace, role: 'owner' }, page }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const body = await request.json().catch(() => ({}))
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.filter((item: unknown): item is string => typeof item === 'string')
    : null

  if (orderIds) {
    const uniqueOrderIds = Array.from(new Set(orderIds))
    if (uniqueOrderIds.length !== orderIds.length) {
      return NextResponse.json({ error: 'orderIds must be unique' }, { status: 400 })
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .in('workspace_id', uniqueOrderIds)

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if ((memberships?.length ?? 0) !== uniqueOrderIds.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    for (const [index, workspaceId] of uniqueOrderIds.entries()) {
      const { error } = await supabaseAdmin
        .from('workspace_members')
        .update({ order_index: index })
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const name = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim()
    : ''

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const isOwner = await requireWorkspaceRole(id, user.id, ['owner'])
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .update({ name })
    .eq('id', id)
    .select('id, name, created_by, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ...data, role: 'owner' })
}
