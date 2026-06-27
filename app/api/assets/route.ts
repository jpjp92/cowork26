import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { getUserFromRequest, requireWorkspaceRole } from '../_utils/auth'
import { createApiTiming } from '../_utils/timing'

const ASSET_BUCKET = 'page_assets'
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function isSupportedImageType(type: string): type is keyof typeof IMAGE_EXTENSIONS {
  return type in IMAGE_EXTENSIONS
}

export async function POST(request: Request) {
  const timing = createApiTiming('POST /api/assets')
  let uploadType = 'unknown'

  try {
    const { user, response } = await getUserFromRequest(request, timing)
    if (!user) return response

    const formData = await timing.measure('request.formData', () => request.formData())
    const workspaceId = formData.get('workspaceId')
    const pageId = formData.get('pageId')
    const file = formData.get('file')

    if (typeof workspaceId !== 'string' || !workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    if (typeof pageId !== 'string' || !pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    uploadType = file.type || 'unknown'
    if (!isSupportedImageType(file.type)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image must be between 1 byte and 5MB' }, { status: 400 })
    }

    const { data: page, error: pageError } = await timing.measure('page.lookup', () => supabaseAdmin
      .from('pages')
      .select('workspace_id')
      .eq('id', pageId)
      .single())

    if (pageError || !page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    if (page.workspace_id !== workspaceId) {
      return NextResponse.json({ error: 'Page does not belong to workspace' }, { status: 400 })
    }

    const canWrite = await requireWorkspaceRole(workspaceId, user.id, ['owner', 'editor'], timing)
    if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const assetId = crypto.randomUUID()
    const extension = IMAGE_EXTENSIONS[file.type]
    const storagePath = `workspaces/${workspaceId}/pages/${pageId}/${assetId}.${extension}`
    const buffer = Buffer.from(await timing.measure('file.arrayBuffer', () => file.arrayBuffer()))

    const { error: uploadError } = await timing.measure('storage.upload', () => supabaseAdmin
      .storage
      .from(ASSET_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
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
        mime_type: file.type,
        size_bytes: file.size,
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
    timing.log({ uploadType })
  }
}
