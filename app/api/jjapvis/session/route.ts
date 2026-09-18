// 짭비스 HUD 세션 핸드셰이크 및 격리 URL 발급 API 라우트임
import { NextResponse } from 'next/server'
import { JJAPVIS_CONFIG, getJjapvisHudUrl } from '../../../../lib/jjapvis/config'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const userId = body.user_id || null
    const clientToken = body.hud_token

    // 클라이언트 토큰이 없으면 신규 격리 토큰 생성함
    const token = clientToken || (typeof crypto.randomUUID === 'function' 
      ? crypto.randomUUID() 
      : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`)

    const hudUrl = getJjapvisHudUrl(token)

    return NextResponse.json({
      ok: true,
      enabled: JJAPVIS_CONFIG.isEnabled,
      hud_token: token,
      hud_url: hudUrl,
      server_url: JJAPVIS_CONFIG.serverUrl,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: '세션 발급 실패함' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: JJAPVIS_CONFIG.isEnabled,
    server_url: JJAPVIS_CONFIG.serverUrl,
  })
}
