import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { getUserFromRequest, requireWorkspaceRole } from '../_utils/auth'
import { createApiTiming } from '../_utils/timing'
import { getPageParentValidationError } from '../../../lib/notion-lite/page-tree'
import { isRevisionedPagePatch, isValidBaseRevision } from '../../../lib/notion-lite/page-revision'
import { ApiError, apiErrorResponse } from '../_utils/api-error'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function validatePageParent(
  pageId: string,
  workspaceId: string,
  parentId: string | null,
  timing: ReturnType<typeof createApiTiming>,
) {
  if (parentId === null) return null

  const { data: pages, error } = await timing.measure('page.parent.validate', () => supabaseAdmin
    .from('pages')
    .select('id, workspace_id, parent_id')
    .eq('workspace_id', workspaceId))

  if (error) {
    return NextResponse.json({ error: 'Failed to validate page hierarchy' }, { status: 500 })
  }

  const validationError = getPageParentValidationError(
    pages ?? [],
    pageId,
    workspaceId,
    parentId,
  )
  return validationError
    ? NextResponse.json({ error: validationError }, { status: 400 })
    : null
}

export async function GET(request: Request) {
  const timing = createApiTiming('GET /api/pages')
  let mode = 'unknown'

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const { searchParams } = new URL(request.url)
    const pageId = searchParams.get('id')

    // single page fetch
    if (pageId) {
      mode = 'single'
      const { data: page, error: pageError } = await timing.measure('page.select', () => supabaseAdmin
        .from('pages')
        .select('id, workspace_id, parent_id, title, order_index, content, content_revision, created_by, updated_by, created_at, updated_at')
        .eq('id', pageId)
        .single())

      if (pageError || !page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

      const canRead = await requireWorkspaceRole(page.workspace_id, user.id, ['owner', 'editor', 'viewer'], timing)
      if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      return NextResponse.json(page)
    }

    mode = 'workspace'
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const canRead = await requireWorkspaceRole(workspaceId, user.id, ['owner', 'editor', 'viewer'], timing)
    if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await timing.measure('pages.select', () => supabaseAdmin
      .from('pages')
      .select('id, workspace_id, parent_id, title, order_index, content, content_revision, created_by, updated_by, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true }))

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } finally {
    timing.log({ mode })
  }
}

export async function POST(request: Request) {
  const timing = createApiTiming('POST /api/pages')

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const body = await timing.measure('request.json', () => request.json().catch(() => ({})))
    const workspaceId = body.workspaceId
    if (typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const canWrite = await requireWorkspaceRole(workspaceId, user.id, ['owner', 'editor'], timing)
    if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : 'Untitled'
    const rawParentId = body.parentId
    const parentId = rawParentId === undefined || rawParentId === null || rawParentId === ''
      ? null
      : rawParentId
    if (parentId !== null && (typeof parentId !== 'string' || !UUID_RE.test(parentId))) {
      return NextResponse.json({ error: 'Valid parentId is required' }, { status: 400 })
    }
    // 클라이언트 낙관적 생성용: 유효한 UUID면 그 id로 insert(없으면 DB 기본값 사용)
    const requestedId = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id : undefined

    const parentValidationResponse = await validatePageParent(
      requestedId ?? crypto.randomUUID(),
      workspaceId,
      parentId,
      timing,
    )
    if (parentValidationResponse) return parentValidationResponse

    const pageCountQuery = supabaseAdmin
      .from('pages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)

    const { count } = await timing.measure('page.count', () => (
      parentId
        ? pageCountQuery.eq('parent_id', parentId)
        : pageCountQuery.is('parent_id', null)
    ))

    const { data, error } = await timing.measure('page.insert', () => supabaseAdmin
      .from('pages')
      .insert({
        ...(requestedId ? { id: requestedId } : {}),
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
      .select('id, workspace_id, parent_id, title, order_index, content, content_revision, created_by, updated_by, created_at, updated_at')
      .single())

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } finally {
    timing.log()
  }
}

export async function PATCH(request: Request) {
  const timing = createApiTiming('PATCH /api/pages')
  let patchType = 'unknown'

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const body = await timing.measure('request.json', () => request.json().catch(() => ({})))
    if (typeof body.id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { data: page, error: pageError } = await timing.measure('page.lookup', () => supabaseAdmin
      .from('pages')
      .select('workspace_id')
      .eq('id', body.id)
      .single())

    if (pageError || !page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

    const canWrite = await requireWorkspaceRole(page.workspace_id, user.id, ['owner', 'editor'], timing)
    if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const patch: Record<string, unknown> = { updated_by: user.id }
    if (typeof body.title === 'string') patch.title = body.title.trim() || 'Untitled'
    if (body.content && typeof body.content === 'object') patch.content = body.content
    const hasParentPatch = Object.prototype.hasOwnProperty.call(body, 'parentId')
    if (
      hasParentPatch &&
      body.parentId !== null &&
      (typeof body.parentId !== 'string' || !UUID_RE.test(body.parentId))
    ) {
      return NextResponse.json({ error: 'Valid parentId is required' }, { status: 400 })
    }
    if (hasParentPatch) {
      const parentId = body.parentId as string | null
      const parentValidationResponse = await validatePageParent(
        body.id,
        page.workspace_id,
        parentId,
        timing,
      )
      if (parentValidationResponse) return parentValidationResponse
      patch.parent_id = parentId
    }
    if (typeof body.orderIndex === 'number') patch.order_index = body.orderIndex
    const revisionedPatch = isRevisionedPagePatch(patch)
    if (revisionedPatch && !isValidBaseRevision(body.baseRevision)) {
      return apiErrorResponse(new ApiError('VALIDATION_ERROR'))
    }
    patchType = [
      patch.title !== undefined ? 'title' : '',
      patch.content !== undefined ? 'content' : '',
      patch.parent_id !== undefined ? 'parent' : '',
      patch.order_index !== undefined ? 'order' : '',
    ].filter(Boolean).join('+') || 'metadata'

    let updateQuery = supabaseAdmin
      .from('pages')
      .update(patch)
      .eq('id', body.id)
    if (revisionedPatch) updateQuery = updateQuery.eq('content_revision', body.baseRevision)

    const { data, error } = await timing.measure('page.update', () => updateQuery
      .select('id, workspace_id, parent_id, title, order_index, content, content_revision, created_by, updated_by, created_at, updated_at')
      .maybeSingle())

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data && revisionedPatch) {
      return apiErrorResponse(new ApiError('PAGE_REVISION_CONFLICT'))
    }
    if (!data) return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    return NextResponse.json(data)
  } finally {
    timing.log({ patchType })
  }
}

export async function DELETE(request: Request) {
  const timing = createApiTiming('DELETE /api/pages')

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const { searchParams } = new URL(request.url)
    const pageId = searchParams.get('id')
    if (!pageId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: page, error: pageError } = await timing.measure('page.lookup', () => supabaseAdmin
      .from('pages')
      .select('workspace_id')
      .eq('id', pageId)
      .single())

    if (pageError || !page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

    const canWrite = await requireWorkspaceRole(page.workspace_id, user.id, ['owner', 'editor'], timing)
    if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await timing.measure('page.delete', () => supabaseAdmin.from('pages').delete().eq('id', pageId))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return new Response(null, { status: 204 })
  } finally {
    timing.log()
  }
}
