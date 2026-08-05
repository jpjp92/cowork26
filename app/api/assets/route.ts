import { NextResponse } from 'next/server'
import {
  getImageSizeError,
  getImageStoragePath,
  IMAGE_ASSET_BUCKET,
  isSupportedImageType,
  isUuid,
  isValidImageSize,
} from '../../../lib/image-assets'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { getUserFromRequest, requireWorkspaceRole } from '../_utils/auth'
import { createApiTiming } from '../_utils/timing'

type UploadRequestBody = {
  action?: unknown
  workspaceId?: unknown
  pageId?: unknown
  assetId?: unknown
  mimeType?: unknown
  sizeBytes?: unknown
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

async function authorizeTarget(
  request: Request,
  body: UploadRequestBody,
  timing: ReturnType<typeof createApiTiming>,
) {
  const { user, response } = await getUserFromRequest(request, timing)
  if (!user) return { response }

  const { workspaceId, pageId } = body
  if (!isUuid(workspaceId)) return { response: badRequest('Valid workspaceId is required') }
  if (!isUuid(pageId)) return { response: badRequest('Valid pageId is required') }

  const { data: page, error: pageError } = await timing.measure('page.lookup', () => supabaseAdmin
    .from('pages')
    .select('workspace_id')
    .eq('id', pageId)
    .single())

  if (pageError || !page) {
    return { response: NextResponse.json({ error: 'Page not found' }, { status: 404 }) }
  }
  if (page.workspace_id !== workspaceId) {
    return { response: badRequest('Page does not belong to workspace') }
  }

  const canWrite = await requireWorkspaceRole(
    workspaceId,
    user.id,
    ['owner', 'editor'],
    timing,
  )
  if (!canWrite) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user, workspaceId, pageId }
}

async function removeStorageObject(storagePath: string) {
  const { error } = await supabaseAdmin.storage.from(IMAGE_ASSET_BUCKET).remove([storagePath])
  if (error) console.error('Failed to clean up image asset', { storagePath, error: error.message })
}

export async function POST(request: Request) {
  const timing = createApiTiming('POST /api/assets')
  let action = 'unknown'

  try {
    const body = await timing.measure('request.json', () => request.json().catch(() => ({}))) as UploadRequestBody
    action = typeof body.action === 'string' ? body.action : 'unknown'

    const authorized = await authorizeTarget(request, body, timing)
    if ('response' in authorized) return authorized.response

    const { user, workspaceId, pageId } = authorized
    if (!isSupportedImageType(body.mimeType)) return badRequest('Unsupported image type')

    if (action === 'prepare') {
      const sizeBytes = Number(body.sizeBytes)
      if (!isValidImageSize(sizeBytes)) {
        return badRequest(getImageSizeError(sizeBytes) ?? 'Invalid image size')
      }

      const assetId = crypto.randomUUID()
      const storagePath = getImageStoragePath(workspaceId, pageId, assetId, body.mimeType)
      const { data, error } = await timing.measure('storage.signUpload', () => supabaseAdmin
        .storage
        .from(IMAGE_ASSET_BUCKET)
        .createSignedUploadUrl(storagePath, { upsert: false }))

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? 'Failed to prepare image upload' },
          { status: 500 },
        )
      }

      return NextResponse.json({
        id: assetId,
        signedUrl: data.signedUrl,
        storagePath,
      })
    }

    if (action === 'complete') {
      if (!isUuid(body.assetId)) return badRequest('Valid assetId is required')

      const storagePath = getImageStoragePath(workspaceId, pageId, body.assetId, body.mimeType)
      const { data: objectInfo, error: infoError } = await timing.measure('storage.info', () => supabaseAdmin
        .storage
        .from(IMAGE_ASSET_BUCKET)
        .info(storagePath))

      const actualSize = objectInfo?.size
      const actualType = objectInfo?.contentType
      if (
        infoError ||
        !objectInfo ||
        !isValidImageSize(actualSize) ||
        actualType !== body.mimeType
      ) {
        if (objectInfo) await removeStorageObject(storagePath)
        return badRequest(
          infoError
            ? 'Uploaded image was not found'
            : getImageSizeError(Number(actualSize)) ?? 'Uploaded image metadata does not match',
        )
      }

      const { data: publicUrlData } = supabaseAdmin
        .storage
        .from(IMAGE_ASSET_BUCKET)
        .getPublicUrl(storagePath)

      const { data: asset, error: assetError } = await timing.measure('asset.insert', () => supabaseAdmin
        .from('page_assets')
        .insert({
          id: body.assetId,
          workspace_id: workspaceId,
          page_id: pageId,
          storage_path: storagePath,
          public_url: publicUrlData.publicUrl,
          mime_type: actualType,
          size_bytes: actualSize,
          created_by: user.id,
        })
        .select('id, storage_path, public_url, mime_type, size_bytes')
        .single())

      if (assetError || !asset) {
        await removeStorageObject(storagePath)
        return NextResponse.json(
          { error: assetError?.message ?? 'Failed to save image metadata' },
          { status: 500 },
        )
      }

      return NextResponse.json({
        id: asset.id,
        url: asset.public_url,
        storagePath: asset.storage_path,
        mimeType: asset.mime_type,
        sizeBytes: asset.size_bytes,
      }, { status: 201 })
    }

    return badRequest('Unsupported upload action')
  } finally {
    timing.log({ action })
  }
}

export async function DELETE(request: Request) {
  const timing = createApiTiming('DELETE /api/assets')

  try {
    const body = await timing.measure('request.json', () => request.json().catch(() => ({}))) as UploadRequestBody
    const authorized = await authorizeTarget(request, body, timing)
    if ('response' in authorized) return authorized.response

    const { workspaceId, pageId } = authorized
    if (!isUuid(body.assetId)) return badRequest('Valid assetId is required')
    if (!isSupportedImageType(body.mimeType)) return badRequest('Unsupported image type')

    const storagePath = getImageStoragePath(workspaceId, pageId, body.assetId, body.mimeType)
    const { data: registeredAsset } = await timing.measure('asset.lookup', () => supabaseAdmin
      .from('page_assets')
      .select('id')
      .eq('id', body.assetId)
      .eq('storage_path', storagePath)
      .maybeSingle())

    if (registeredAsset) {
      return NextResponse.json({ error: 'Registered assets cannot be cancelled' }, { status: 409 })
    }

    await timing.measure('storage.remove', () => supabaseAdmin
      .storage
      .from(IMAGE_ASSET_BUCKET)
      .remove([storagePath]))

    return new NextResponse(null, { status: 204 })
  } finally {
    timing.log()
  }
}
