import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { getUserFromRequest } from '../_utils/auth'

export async function GET(request: Request) {
  const { user, response } = await getUserFromRequest(request)
  if (!user) return response

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 })
  }

  const workspaceIds = memberships?.map(row => row.workspace_id) ?? []
  if (workspaceIds.length === 0) return NextResponse.json([])

  const { data: workspaces, error } = await supabaseAdmin
    .from('workspaces')
    .select('id, name, created_by, created_at')
    .in('id', workspaceIds)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const roleByWorkspace = new Map(memberships?.map(row => [row.workspace_id, row.role]))
  return NextResponse.json(
    workspaces?.map(workspace => ({
      ...workspace,
      role: roleByWorkspace.get(workspace.id) ?? 'viewer',
    })) ?? []
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

  const { error: memberError } = await supabaseAdmin
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })

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
