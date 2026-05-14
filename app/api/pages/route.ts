import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { getUserFromRequest, requireWorkspaceRole } from '../_utils/auth'

export async function GET(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const canRead = await requireWorkspaceRole(workspaceId, user.id, ['owner', 'editor', 'viewer'])
  if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('pages')
    .select('id, workspace_id, parent_id, title, order_index, content, created_by, updated_by, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const body = await request.json().catch(() => ({}))
  const workspaceId = body.workspaceId
  if (typeof workspaceId !== 'string') {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const canWrite = await requireWorkspaceRole(workspaceId, user.id, ['owner', 'editor'])
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim()
    : 'Untitled'
  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null

  const pageCountQuery = supabaseAdmin
    .from('pages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  const { count } = parentId
    ? await pageCountQuery.eq('parent_id', parentId)
    : await pageCountQuery.is('parent_id', null)

  const { data, error } = await supabaseAdmin
    .from('pages')
    .insert({
      workspace_id: workspaceId,
      parent_id: parentId,
      title,
      order_index: count ?? 0,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id, workspace_id, parent_id, title, order_index, content, created_by, updated_by, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { data: page, error: pageError } = await supabaseAdmin
    .from('pages')
    .select('workspace_id')
    .eq('id', body.id)
    .single()

  if (pageError || !page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const canWrite = await requireWorkspaceRole(page.workspace_id, user.id, ['owner', 'editor'])
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const patch: Record<string, unknown> = { updated_by: user.id }
  if (typeof body.title === 'string') patch.title = body.title.trim() || 'Untitled'
  if (body.content && typeof body.content === 'object') patch.content = body.content
  if (typeof body.parentId === 'string' || body.parentId === null) patch.parent_id = body.parentId
  if (typeof body.orderIndex === 'number') patch.order_index = body.orderIndex

  const { data, error } = await supabaseAdmin
    .from('pages')
    .update(patch)
    .eq('id', body.id)
    .select('id, workspace_id, parent_id, title, order_index, content, created_by, updated_by, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const { searchParams } = new URL(request.url)
  const pageId = searchParams.get('id')
  if (!pageId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: page, error: pageError } = await supabaseAdmin
    .from('pages')
    .select('workspace_id')
    .eq('id', pageId)
    .single()

  if (pageError || !page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const canWrite = await requireWorkspaceRole(page.workspace_id, user.id, ['owner', 'editor'])
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabaseAdmin.from('pages').delete().eq('id', pageId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new Response(null, { status: 204 })
}
