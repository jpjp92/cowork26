// 100만 명 프로덕션급 사용자별 격리 HUD 토큰 관리자임
import { JJAPVIS_CONFIG } from './config'

// 사용자 ID 또는 기기별 고유 hud_token을 획득하거나 생성함
export function getOrCreateHudToken(userId?: string | null): string {
  if (typeof window === 'undefined') return ''

  const storageKey = userId 
    ? `${JJAPVIS_CONFIG.storageKey}:${userId}` 
    : JJAPVIS_CONFIG.storageKey

  let token = localStorage.getItem(storageKey)
  if (!token) {
    // 100만 명 규모 고유 세션 격리를 위한 암호화 UUID 발급함
    token = typeof crypto.randomUUID === 'function' 
      ? crypto.randomUUID() 
      : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
    localStorage.setItem(storageKey, token)
  }
  return token
}

// 토큰 강제 초기화 및 재생성함
export function resetHudToken(userId?: string | null): string {
  if (typeof window === 'undefined') return ''

  const storageKey = userId 
    ? `${JJAPVIS_CONFIG.storageKey}:${userId}` 
    : JJAPVIS_CONFIG.storageKey

  const newToken = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  localStorage.setItem(storageKey, newToken)
  return newToken
}
