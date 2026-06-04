import { NextResponse } from 'next/server'

const SERVER_URL = process.env.JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

export async function POST(request: Request) {
  // 클라이언트가 넘겨준 token이 있으면 그대로 쓰고, 없으면 랜덤 생성
  const body = await request.json().catch(() => ({}))
  const token = body.hud_token || crypto.randomUUID()
  
  return NextResponse.json({ 
    ok: true, 
    mode: 'protocol', 
    agi_url: `agi://start?hud_token=${token}`, 
    hud_token: token 
  })
}

export async function DELETE() {
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    download_url: `${SERVER_URL}/download/AGI-client.msi`,
  })
}

