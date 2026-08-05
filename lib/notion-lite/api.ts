import type {
  CloneImageSource,
  PageRecord,
  PreparedImageUpload,
  UploadedImageAsset,
  Workspace,
  WorkspaceMember,
} from './types'
import { getImageSizeError, isSupportedImageType } from '../image-assets'

interface CreateWorkspaceResponse {
  workspace: Workspace
  page?: PageRecord
}

interface PageUpdatePatch {
  title?: string
  content?: Record<string, unknown> | null
  parentId?: string | null
  orderIndex?: number
}

async function readError(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: string }
    return new Error(data.error ? `${fallback}: ${data.error}` : fallback)
  } catch {
    return new Error(fallback)
  }
}

async function requestJson<T>(
  accessToken: string,
  input: string,
  fallback: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(input, { ...init, headers })
  if (!response.ok) throw await readError(response, fallback)
  return response.json() as Promise<T>
}

async function requestEmpty(
  accessToken: string,
  input: string,
  fallback: string,
  init: RequestInit,
) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body) headers.set('Content-Type', 'application/json')

  const response = await fetch(input, { ...init, headers })
  if (!response.ok) throw await readError(response, fallback)
}

const STANDARD_IMAGE_UPLOAD_TARGET_BYTES = 5 * 1024 * 1024

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality))
}

async function optimizeLargeImage(file: File) {
  if (file.size <= STANDARD_IMAGE_UPLOAD_TARGET_BYTES) return file
  if (file.type === 'image/gif') {
    throw new Error('움직이는 GIF는 5MB 이하만 업로드할 수 있습니다.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('큰 이미지를 브라우저에서 최적화하지 못했습니다.')
  }

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이미지 변환 기능을 사용할 수 없습니다.')

    let scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
    for (const quality of [0.86, 0.74, 0.62]) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

      const blob = await canvasToBlob(canvas, quality)
      if (blob && blob.size <= STANDARD_IMAGE_UPLOAD_TARGET_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'pasted-image'
        return new File([blob], `${baseName}.webp`, { type: 'image/webp' })
      }
      scale *= 0.8
    }

    throw new Error('이미지를 5MB 이하로 최적화하지 못했습니다.')
  } finally {
    bitmap.close()
  }
}

function uploadImageToSignedUrl(signedUrl: string, file: File) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('cacheControl', '3600')
    formData.append('', file)

    request.open('PUT', signedUrl)
    request.timeout = 5 * 60 * 1000
    request.setRequestHeader('x-upsert', 'false')
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve()

      let detail = request.responseText
      try {
        const parsed = JSON.parse(request.responseText) as { message?: string; error?: string }
        detail = parsed.message || parsed.error || detail
      } catch {
        // JSON이 아닌 Storage 응답은 원문을 사용한다.
      }
      reject(new Error(detail
        ? `Supabase Storage 업로드 실패 (${request.status}): ${detail}`
        : `Supabase Storage 업로드 실패 (${request.status})`))
    }
    request.onerror = () => reject(new Error(
      `Supabase Storage 연결이 중단되었습니다 (${(file.size / 1024 / 1024).toFixed(1)}MB).`,
    ))
    request.ontimeout = () => reject(new Error('이미지 업로드 시간이 5분을 초과했습니다.'))
    request.onabort = () => reject(new Error('이미지 업로드가 취소되었습니다.'))
    request.send(formData)
  })
}

export const notionLiteApi = {
  listWorkspaces(accessToken: string) {
    return requestJson<Workspace[]>(
      accessToken,
      '/api/workspaces',
      '워크스페이스를 불러오지 못했습니다.',
    )
  },

  createWorkspace(accessToken: string, name: string) {
    return requestJson<CreateWorkspaceResponse>(
      accessToken,
      '/api/workspaces',
      '워크스페이스를 만들지 못했습니다.',
      { method: 'POST', body: JSON.stringify({ name }) },
    )
  },

  renameWorkspace(accessToken: string, id: string, name: string) {
    return requestJson<Workspace>(
      accessToken,
      '/api/workspaces',
      '워크스페이스 이름을 바꾸지 못했습니다.',
      { method: 'PATCH', body: JSON.stringify({ id, name }) },
    )
  },

  reorderWorkspaces(accessToken: string, orderIds: string[]) {
    return requestJson<{ ok: boolean }>(
      accessToken,
      '/api/workspaces',
      '워크스페이스 순서를 저장하지 못했습니다.',
      { method: 'PATCH', body: JSON.stringify({ orderIds }) },
    )
  },

  listPages(accessToken: string, workspaceId: string, signal?: AbortSignal) {
    return requestJson<PageRecord[]>(
      accessToken,
      `/api/pages?workspaceId=${encodeURIComponent(workspaceId)}`,
      '페이지를 불러오지 못했습니다.',
      { signal },
    )
  },

  getPage(accessToken: string, pageId: string, signal?: AbortSignal) {
    return requestJson<PageRecord>(
      accessToken,
      `/api/pages?id=${encodeURIComponent(pageId)}`,
      '페이지를 불러오지 못했습니다.',
      { signal },
    )
  },

  createPage(
    accessToken: string,
    input: { id: string; workspaceId: string; parentId: string | null; title: string },
  ) {
    return requestJson<PageRecord>(
      accessToken,
      '/api/pages',
      '페이지를 만들지 못했습니다.',
      { method: 'POST', body: JSON.stringify(input) },
    )
  },

  updatePage(accessToken: string, id: string, patch: PageUpdatePatch) {
    return requestJson<PageRecord>(
      accessToken,
      '/api/pages',
      '페이지를 저장하지 못했습니다.',
      { method: 'PATCH', body: JSON.stringify({ id, ...patch }) },
    )
  },

  deletePage(accessToken: string, pageId: string) {
    return requestEmpty(
      accessToken,
      `/api/pages?id=${encodeURIComponent(pageId)}`,
      '페이지를 삭제하지 못했습니다.',
      { method: 'DELETE' },
    )
  },

  async movePages(accessToken: string, pages: PageRecord[]) {
    await Promise.all(pages.map(page => requestJson<PageRecord>(
      accessToken,
      '/api/pages',
      '페이지 위치를 저장하지 못했습니다.',
      {
        method: 'PATCH',
        body: JSON.stringify({
          id: page.id,
          parentId: page.parent_id,
          orderIndex: page.order_index,
        }),
      },
    )))
  },

  listMembers(accessToken: string, workspaceId: string) {
    return requestJson<WorkspaceMember[]>(
      accessToken,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      '멤버를 불러오지 못했습니다.',
    )
  },

  inviteMember(
    accessToken: string,
    workspaceId: string,
    email: string,
    role: 'editor' | 'viewer',
  ) {
    return requestJson<WorkspaceMember>(
      accessToken,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      '멤버를 추가하지 못했습니다.',
      { method: 'POST', body: JSON.stringify({ email, role }) },
    )
  },

  async uploadAsset(
    accessToken: string,
    workspaceId: string,
    pageId: string,
    file: File,
  ) {
    if (!isSupportedImageType(file.type)) {
      throw new Error('PNG, JPEG, WebP, GIF 이미지만 업로드할 수 있습니다.')
    }
    const sizeError = getImageSizeError(file.size)
    if (sizeError) throw new Error(sizeError)
    const uploadFile = await optimizeLargeImage(file)

    const prepared = await requestJson<PreparedImageUpload>(
      accessToken,
      '/api/assets',
      '이미지 업로드를 준비하지 못했습니다.',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'prepare',
          workspaceId,
          pageId,
          mimeType: uploadFile.type,
          sizeBytes: uploadFile.size,
        }),
      },
    )

    const completeUpload = () => requestJson<UploadedImageAsset>(
      accessToken,
      '/api/assets',
      '이미지 업로드를 완료하지 못했습니다.',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'complete',
          workspaceId,
          pageId,
          assetId: prepared.id,
          mimeType: uploadFile.type,
        }),
      },
    )

    try {
      let uploadError: unknown = null
      try {
        await uploadImageToSignedUrl(prepared.signedUrl, uploadFile)
      } catch (error) {
        uploadError = error
      }

      // 브라우저가 성공 응답만 놓친 경우에도 Storage의 실제 객체를 확인해 업로드를 살린다.
      if (uploadError) {
        try {
          const completed = await completeUpload()
          return { ...completed, alt: file.name || completed.alt || 'pasted image' }
        } catch {
          throw uploadError
        }
      }

      const data = await completeUpload()
      return { ...data, alt: file.name || data.alt || 'pasted image' }
    } catch (error) {
      await requestEmpty(
        accessToken,
        '/api/assets',
        '업로드 중인 이미지를 정리하지 못했습니다.',
        {
          method: 'DELETE',
          body: JSON.stringify({
            workspaceId,
            pageId,
            assetId: prepared.id,
            mimeType: uploadFile.type,
          }),
        },
      ).catch(cleanupError => console.error('Image upload cleanup failed', cleanupError))
      throw error
    }
  },

  async cloneAsset(
    accessToken: string,
    workspaceId: string,
    pageId: string,
    source: CloneImageSource,
  ) {
    const data = await requestJson<UploadedImageAsset>(
      accessToken,
      '/api/assets/clone',
      '이미지를 복사하지 못했습니다.',
      {
        method: 'POST',
        body: JSON.stringify({
          workspaceId,
          pageId,
          sourceAssetId: source.assetId,
          sourceStoragePath: source.storagePath,
        }),
      },
    )
    return { ...data, alt: source.alt || data.alt || 'copied image' }
  },
}
