// 구글 OAuth 2.0 인가 코드(code)를 토큰으로 교환하고 짭비스 사용자 쿼터로 등록하는 API임
import { NextResponse } from 'next/server'
import { JJAPVIS_CONFIG } from '../../../../../lib/jjapvis/config'

const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

interface ExchangeRequest {
  code: string
  redirect_uri: string
}

export async function POST(request: Request) {
  try {
    const body: ExchangeRequest = await request.json()
    const { code, redirect_uri } = body

    if (!code) {
      return NextResponse.json({ ok: false, error: '인가 코드(code)가 누락됨' }, { status: 400 })
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json(
        { ok: false, error: '서버에 구글 OAuth 환경 변수(GOOGLE_CLIENT_ID / SECRET)가 설정되지 않음' },
        { status: 500 }
      )
    }

    // 1. 구글 본사 토큰 엔드포인트로 인가 코드 교환 요청함
    const tokenParams = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirect_uri || `${new URL(request.url).origin}/auth/callback/google`,
      grant_type: 'authorization_code',
    })

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[GoogleAuth] 구글 토큰 교환 실패함:', tokenData)
      return NextResponse.json(
        { ok: false, error: tokenData.error_description || tokenData.error || '토큰 교환 실패' },
        { status: 400 }
      )
    }

    const accessToken = tokenData.access_token as string
    const expiresIn = (tokenData.expires_in as number) || 3600

    // 2. 구글 사용자 프로필(email) 조회함
    let email = ''
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        email = (userData.email || '').toLowerCase()
      }
    } catch (err) {
      console.warn('[GoogleAuth] 사용자 정보 조회 경고:', err)
    }

    if (!email) {
      email = 'user_' + crypto.randomUUID().slice(0, 8)
    }

    // 3. 짭비스 백엔드(/auth/token)에 사용자별 쿼터 토큰 등록함
    try {
      const jjapvisRes = await fetch(`${JJAPVIS_CONFIG.serverUrl}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: email,
          google_oauth_token: accessToken,
          flow_session: '',
        }),
      })

      if (!jjapvisRes.ok) {
        console.warn('[GoogleAuth] 짭비스 서버 등록 응답 경고:', jjapvisRes.status)
      }
    } catch (err) {
      console.warn('[GoogleAuth] 짭비스 서버 토큰 전송 실패함 (오프라인 가능성):', err)
    }

    return NextResponse.json({
      ok: true,
      email,
      accessToken,
      expiresIn,
    })
  } catch (error) {
    console.error('[GoogleAuth] 예외 발생함:', error)
    return NextResponse.json(
      { ok: false, error: '서버 내부 오류가 발생함' },
      { status: 500 }
    )
  }
}
