import { afterEach, describe, expect, it, vi } from 'vitest'
import { notionLiteApi } from '../../lib/notion-lite/api'

describe('workspace AI policy browser client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends an authenticated no-store policy update with explicit fields', async () => {
    const workspaceId = 'f0bece0f-b21b-4f98-a374-01815c01c4fa'
    const policy = {
      enabled: true,
      allowedProviders: ['openai'] as const,
      allowedRoles: ['owner', 'editor'] as const,
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      workspaceId,
      ...policy,
      updatedAt: '2026-09-27T00:00:00.000Z',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await notionLiteApi.updateWorkspaceAiPolicy('access-token', workspaceId, {
      enabled: policy.enabled,
      allowedProviders: [...policy.allowedProviders],
      allowedRoles: [...policy.allowedRoles],
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/workspaces/${workspaceId}/ai-policy`)
    expect(init).toMatchObject({ method: 'PATCH', cache: 'no-store' })
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-token')
    expect(JSON.parse(String(init.body))).toEqual(policy)
  })
})
