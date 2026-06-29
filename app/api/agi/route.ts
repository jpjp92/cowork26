import { NextResponse } from 'next/server'

const SERVER_URL = process.env.JJAPVIS_SERVER_URL || ''

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token = body.hud_token || crypto.randomUUID()
  
  const agiUrl = `agi://start?hud_token=${token}`

  // 클라우드 환경(Vercel)에서는 백엔드에서 사용자 PC의 exe를 찾거나 켤 수 없습니다.
  // 오직 프론트엔드에서 커스텀 프로토콜(agi://)을 통해 실행을 유도해야 합니다.
  return NextResponse.json({ 
    ok: true, 
    status: 'fire_protocol',
    hud_token: token,
    download_url: `${SERVER_URL}/download/AGI-client.exe`,
    agi_url: agiUrl
  })
}

export async function DELETE() {
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    download_url: `${SERVER_URL}/download/AGI-client.exe`,
  })
}

