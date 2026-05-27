import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SERVER_URL = process.env.JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

/**
 * GET /api/agi/connected?hud_token=...
 * AGI 서버의 /client/connected 를 서버사이드에서 프록시 (CORS 우회).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('hud_token') ?? ''
  try {
    const url = `${SERVER_URL}/client/connected${token ? '?hud_token=' + encodeURIComponent(token) : ''}`
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return NextResponse.json({ connected: false })
    const data = await r.json().catch(() => ({}))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ connected: false })
  }
}
