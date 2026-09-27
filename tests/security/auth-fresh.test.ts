import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const from = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('../../lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: { getUser },
    from,
  },
}))

describe('fresh authentication', () => {
  beforeEach(() => {
    vi.resetModules()
    getUser.mockReset()
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    const single = vi.fn().mockResolvedValue({ data: { role: 'owner' }, error: null })
    const eqUser = vi.fn(() => ({ single }))
    const eqWorkspace = vi.fn(() => ({ eq: eqUser }))
    const select = vi.fn(() => ({ eq: eqWorkspace }))
    from.mockReset()
    from.mockReturnValue({ select })
  })

  it('bypasses the token cache for a sensitive request', async () => {
    const { getUserFromRequest } = await import('../../app/api/_utils/auth')
    const request = new Request('http://localhost/test', {
      headers: { authorization: 'Bearer token-1' },
    })

    await getUserFromRequest(request)
    await getUserFromRequest(request)
    expect(getUser).toHaveBeenCalledTimes(1)

    await getUserFromRequest(request, undefined, { fresh: true })
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed authorization without calling Supabase', async () => {
    const { getUserFromRequest } = await import('../../app/api/_utils/auth')
    const request = new Request('http://localhost/test', {
      headers: { authorization: 'Basic secret-token' },
    })

    const result = await getUserFromRequest(request, undefined, { fresh: true })
    expect(result.user).toBeNull()
    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('bypasses the role cache for a sensitive request', async () => {
    const { requireWorkspaceRole } = await import('../../app/api/_utils/auth')

    await requireWorkspaceRole('workspace-1', 'user-1', ['owner'])
    await requireWorkspaceRole('workspace-1', 'user-1', ['owner'])
    expect(from).toHaveBeenCalledTimes(1)

    await requireWorkspaceRole('workspace-1', 'user-1', ['owner'], { fresh: true })
    expect(from).toHaveBeenCalledTimes(2)
  })
})
