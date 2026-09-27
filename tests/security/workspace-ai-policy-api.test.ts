import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserFromRequest = vi.fn()
const requireWorkspaceRole = vi.fn()
const from = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('../../lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
vi.mock('../../app/api/_utils/auth', () => ({ getUserFromRequest, requireWorkspaceRole }))

const workspaceId = 'f0bece0f-b21b-4f98-a374-01815c01c4fa'
const userId = '7ee06e5b-b1ab-4dd3-830b-9be777a41845'
const context = { params: Promise.resolve({ id: workspaceId }) }
const request = (method: string, body?: unknown) => new Request(
  `http://localhost/api/workspaces/${workspaceId}/ai-policy`,
  {
    method,
    headers: { authorization: 'Bearer token', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  },
)

describe('workspace AI policy API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getUserFromRequest.mockResolvedValue({ user: { id: userId }, response: null })
    requireWorkspaceRole.mockResolvedValue(true)
  })

  it('returns a disabled default only to a freshly checked workspace member', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const secondEq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq: secondEq }))
    from.mockReturnValue({ select })
    const { GET } = await import('../../app/api/workspaces/[id]/ai-policy/route')

    const response = await GET(request('GET'), context)
    await expect(response.json()).resolves.toEqual({
      workspaceId,
      enabled: false,
      allowedProviders: ['openai', 'gemini'],
      allowedRoles: ['owner', 'editor'],
      updatedAt: null,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(getUserFromRequest).toHaveBeenCalledWith(expect.any(Request), undefined, { fresh: true })
    expect(requireWorkspaceRole).toHaveBeenCalledWith(
      workspaceId,
      userId,
      ['owner', 'editor', 'viewer'],
      { fresh: true },
    )
  })

  it('rejects a removed member before reading policy metadata', async () => {
    requireWorkspaceRole.mockResolvedValue(false)
    const { GET } = await import('../../app/api/workspaces/[id]/ai-policy/route')
    const response = await GET(request('GET'), context)
    expect(response.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('allows only a fresh owner to upsert an explicit policy', async () => {
    let stored: Record<string, unknown> | undefined
    const single = vi.fn().mockResolvedValue({
      data: {
        enabled: true,
        allowed_providers: ['openai'],
        allowed_roles: ['owner', 'editor'],
        updated_at: '2026-09-27T00:00:00.000Z',
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn((value: Record<string, unknown>) => {
      stored = value
      return { select }
    })
    from.mockReturnValue({ upsert })
    const { PATCH } = await import('../../app/api/workspaces/[id]/ai-policy/route')
    const response = await PATCH(request('PATCH', {
      enabled: true,
      allowedProviders: ['openai'],
      allowedRoles: ['owner', 'editor'],
    }), context)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(requireWorkspaceRole).toHaveBeenCalledWith(workspaceId, userId, ['owner'], { fresh: true })
    expect(stored).toEqual({
      workspace_id: workspaceId,
      enabled: true,
      allowed_providers: ['openai'],
      allowed_roles: ['owner', 'editor'],
      updated_by: userId,
    })
  })

  it.each([
    { enabled: true, allowedProviders: ['fake'], allowedRoles: ['owner'] },
    { enabled: true, allowedProviders: [], allowedRoles: ['owner'] },
    { enabled: true, allowedProviders: ['openai'], allowedRoles: ['viewer'] },
    { enabled: 'true', allowedProviders: ['openai'], allowedRoles: ['owner'] },
  ])('rejects invalid or internal-only policy values', async body => {
    const { PATCH } = await import('../../app/api/workspaces/[id]/ai-policy/route')
    const response = await PATCH(request('PATCH', body), context)
    expect(response.status).toBe(422)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects non-owners before parsing or writing policy', async () => {
    requireWorkspaceRole.mockResolvedValue(false)
    const { PATCH } = await import('../../app/api/workspaces/[id]/ai-policy/route')
    const response = await PATCH(request('PATCH', {
      enabled: true,
      allowedProviders: ['openai'],
      allowedRoles: ['owner'],
    }), context)
    expect(response.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('does not expose database errors', async () => {
    const marker = 'PRIVATE_POLICY_DATABASE_MARKER'
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: new Error(marker) })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    from.mockReturnValue({ select })
    const { GET } = await import('../../app/api/workspaces/[id]/ai-policy/route')
    const response = await GET(request('GET'), context)
    const serialized = JSON.stringify(await response.json())
    expect(response.status).toBe(500)
    expect(serialized).not.toContain(marker)
    expect(serialized).toContain('INTERNAL_ERROR')
  })
})
