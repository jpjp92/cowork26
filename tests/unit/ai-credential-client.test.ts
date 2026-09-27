import { afterEach, describe, expect, it, vi } from 'vitest'
import { notionLiteApi } from '../../lib/notion-lite/api'

describe('AI credential browser client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses an authenticated no-store request and does not put the key in the URL', async () => {
    const marker = 'PRIVATE-KEY-MARKER-1234'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      provider: 'openai',
      connected: true,
      keyLastFour: '1234',
      verifiedAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await notionLiteApi.connectAiCredential('access-token', 'openai', marker)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)

    expect(url).toBe('/api/ai/credentials/openai')
    expect(url).not.toContain(marker)
    expect(init.method).toBe('PUT')
    expect(init.cache).toBe('no-store')
    expect(headers.get('authorization')).toBe('Bearer access-token')
    expect(init.body).toBe(JSON.stringify({ apiKey: marker }))
    expect(JSON.stringify(result)).not.toContain(marker)
  })

  it('uses DELETE without sending credential material', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await notionLiteApi.deleteAiCredential('access-token', 'gemini')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/ai/credentials/gemini')
    expect(init).toMatchObject({ method: 'DELETE', cache: 'no-store' })
    expect(init.body).toBeUndefined()
  })
})
