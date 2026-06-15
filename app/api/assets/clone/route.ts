import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { getUserFromRequest, requireWorkspaceRole } from '../../_utils/auth'
import { createApiTiming } from '../../_utils/timing'

const ASSET_BUCKET = 'page_assets'

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function getExtension(mimeType: string) {
  return IMAGE_EXTENSIONS[mimeType] ?? 'png'
}

export async function POST(request: Request) {
  const timing = createApiTiming('POST /api/assets/clone')
  let cloneType = 'unknown'

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const body = await timing.measure('request.json', () => request.json().catch(() => ({})))
    const workspaceId = body.workspaceId
    const pageId = body.pageId
    const sourceAssetId = body.sourceAssetId
    const sourceStoragePath = body.sourceStoragePath

    if (typeof workspaceId !== 'string' || !workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    if (typeof pageId !== 'string' || !pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 })
    }
    if (
      (typeof sourceAssetId !== 'string' || !sourceAssetId) &&
      (typeof sourceStoragePath !== 'string' || !sourceStoragePath)
    ) {
      return NextResponse.json({ error: 'sourceAssetId or sourceStoragePath is required' }, { status: 400 })
    }

    const { data: targetPage, error: targetPageError } = await timing.measure('target.page.lookup', () => supabaseAdmin
      .from('pages')
      .select('workspace_id')
      .eq('id', pageId)
      .single())

    if (targetPageError || !targetPage) return NextResponse.json({ error: 'Target page not found' }, { status: 404 })
    if (targetPage.workspace_id !== workspaceId) {
      return NextResponse.json({ error: 'Target page does not belong to workspace' }, { status: 400 })
    }

    const canWriteTarget = await requireWorkspaceRole(workspaceId, user.id, ['owner', 'editor'], timing, 'target.role.select')
    if (!canWriteTarget) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const sourceQuery = supabaseAdmin
      .from('page_assets')
      .select('id, workspace_id, page_id, storage_path, public_url, mime_type, size_bytes')
      .is('deleted_at', null)

    const { data: sourceAsset, error: sourceAssetError } = await timing.measure('source.asset.lookup', () => (
      typeof sourceAssetId === 'string' && sourceAssetId
        ? sourceQuery.eq('id', sourceAssetId).single()
        : sourceQuery.eq('storage_path', sourceStoragePath).single()
    ))

    if (sourceAssetError || !sourceAsset) {
      return NextResponse.json({ error: 'Source asset not found' }, { status: 404 })
    }

    cloneType = sourceAsset.mime_type
    const canReadSource = await requireWorkspaceRole(
      sourceAsset.workspace_id,
      user.id,
      ['owner', 'editor', 'viewer'],
      timing,
      'source.role.select',
    )
    if (!canReadSource) return NextResponse.json({ error: 'Source asset forbidden' }, { status: 403 })

    const { data: sourceBlob, error: downloadError } = await timing.measure('storage.download', () => supabaseAdmin
      .storage
      .from(ASSET_BUCKET)
      .download(sourceAsset.storage_path))

    if (downloadError || !sourceBlob) {
      return NextResponse.json({ error: downloadError?.message ?? 'Source asset download failed' }, { status: 500 })
    }

    const assetId = crypto.randomUUID()
    const storagePath = `workspaces/${workspaceId}/pages/${pageId}/${assetId}.${getExtension(sourceAsset.mime_type)}`
    const buffer = Buffer.from(await timing.measure('source.arrayBuffer', () => sourceBlob.arrayBuffer()))

    const { error: uploadError } = await timing.measure('storage.upload', () => supabaseAdmin
      .storage
      .from(ASSET_BUCKET)
      .upload(storagePath, buffer, {
        contentType: sourceAsset.mime_type,
        upsert: false,
      }))

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: publicUrlData } = supabaseAdmin
      .storage
      .from(ASSET_BUCKET)
      .getPublicUrl(storagePath)

    const publicUrl = publicUrlData.publicUrl

    const { data: asset, error: assetError } = await timing.measure('asset.insert', () => supabaseAdmin
      .from('page_assets')
      .insert({
        id: assetId,
        workspace_id: workspaceId,
        page_id: pageId,
        storage_path: storagePath,
        public_url: publicUrl,
        mime_type: sourceAsset.mime_type,
        size_bytes: sourceAsset.size_bytes,
        created_by: user.id,
      })
      .select('id, workspace_id, page_id, storage_path, public_url, mime_type, size_bytes, created_at')
      .single())

    if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 })

    return NextResponse.json({
      id: asset.id,
      url: asset.public_url,
      storagePath: asset.storage_path,
      mimeType: asset.mime_type,
      sizeBytes: asset.size_bytes,
    }, { status: 201 })
  } finally {
    timing.log({ cloneType })
  }
}
