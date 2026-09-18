// 100만 명 프로덕션급 사용자별 구글 계정 OAuth 연동 및 짭비스 토큰 등록 모듈임
import { JJAPVIS_CONFIG } from './config'

export interface GoogleAuthUser {
  email: string
  accessToken: string
  expiresAt: number
}

const STORAGE_AUTH_KEY = 'cowork26:jjapvis:google_user'

// 구글 OAuth 2.0 공식 Client ID (Antigravity / Cloud Code)
const GOOGLE_CLIENT_ID = '32555940559.apps.googleusercontent.com'
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ')

// 현재 저장된 사용자 구글 인증 정보 조회함
export function getGoogleAuthSession(): GoogleAuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_AUTH_KEY)
    if (!raw) return null
    const user: GoogleAuthUser = JSON.parse(raw)
    if (user.expiresAt && Date.now() > user.expiresAt) {
      localStorage.removeItem(STORAGE_AUTH_KEY)
      return null
    }
    return user
  } catch {
    return null
  }
}

// 획득한 사용자 구글 토큰을 짭비스 백엔드(/auth/token)에 등록하여 사용자별 쿼터로 바인딩함
export async function registerTokenToJjapvis(email: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${JJAPVIS_CONFIG.serverUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: email,
        google_oauth_token: accessToken,
        flow_session: '',
      }),
    })
    return res.ok
  } catch (err) {
    console.error('[GoogleAuth] 짭비스 서버 토큰 등록 실패함:', err)
    return false
  }
}

// 브라우저 팝업을 통한 구글 OAuth2 로그인 실행함
export function openGoogleLoginPopup(): Promise<GoogleAuthUser> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('브라우저 환경이 아님'))
    }

    const redirectUri = `${window.location.origin}/auth/callback/google`
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&prompt=select_account`

    const width = 500
    const height = 650
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const popup = window.open(
      authUrl,
      'GoogleSignIn',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    )

    if (!popup) {
      return reject(new Error('팝업 차단됨. 팝업을 허용해 주세요.'))
    }

    // 팝업으로부터 토큰 전달받는 이벤트 리스너 등록함
    const handleAuthMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      const data = event.data
      if (data && data.type === 'google_oauth_token' && data.accessToken) {
        window.removeEventListener('message', handleAuthMessage)
        clearInterval(pollTimer)

        try {
          // 토큰으로 구글 사용자 프로필(email) 조회함
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          })
          const userInfo = await userInfoRes.json()
          const email = userInfo.email || 'unknown_user'

          const authUser: GoogleAuthUser = {
            email,
            accessToken: data.accessToken,
            expiresAt: Date.now() + (parseInt(data.expiresIn, 10) || 3600) * 1000,
          }

          // 로컬스토리지 저장함
          localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(authUser))

          // 짭비스 백엔드로 전송하여 사용자 쿼터 바인딩함
          await registerTokenToJjapvis(email, data.accessToken)

          resolve(authUser)
        } catch (err) {
          reject(err)
        }
      }
    }

    window.addEventListener('message', handleAuthMessage)

    // 사용자가 창을 그냥 닫은 경우 감지함
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer)
        window.removeEventListener('message', handleAuthMessage)
        reject(new Error('로그인 창이 닫혔습니다.'))
      }
    }, 500)
  })
}

// 구글 로그아웃 처리함
export function logoutGoogle(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_AUTH_KEY)
}
