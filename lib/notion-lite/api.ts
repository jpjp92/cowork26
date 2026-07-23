import type {
  CloneImageSource,
  PageRecord,
  UploadedImageAsset,
  Workspace,
  WorkspaceMember,
} from './types'

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
    const formData = new FormData()
    formData.append('workspaceId', workspaceId)
    formData.append('pageId', pageId)
    formData.append('file', file)

    const data = await requestJson<UploadedImageAsset>(
      accessToken,
      '/api/assets',
      '이미지를 업로드하지 못했습니다.',
      { method: 'POST', body: formData },
    )
    return { ...data, alt: file.name || data.alt || 'pasted image' }
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
