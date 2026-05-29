import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SERVER_URL = process.env.JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

/**
 * POST /api/uploads — 여러 파일을 jjapvis 서버로 업로드 (프록시)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const res = await fetch(`${SERVER_URL}/upload`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ ok: false, error: '서버 연결 실패' }, { status: 502 })
  }
}

/**
 * GET /api/uploads — jjapvis 서버의 업로드 파일 목록 조회 (프록시)
 */
export async function GET() {
  try {
    const res = await fetch(`${SERVER_URL}/uploads`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ files: [] })
  }
}
