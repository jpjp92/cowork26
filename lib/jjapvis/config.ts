// 짭비스 연동 인프라 환경변수 및 기본 설정 모듈임

export const JJAPVIS_CONFIG = {
  // 짭비스 FastAPI 서버 URL (기본 8000번 포트)
  serverUrl: (
    process.env.NEXT_PUBLIC_JJAPVIS_SERVER_URL ||
    process.env.JJAPVIS_SERVER_URL ||
    'http://localhost:1777'
  ).replace(/\/$/, ''),

  // AGI 위젯 활성화 플래그 (명시적 false가 아니면 기본 활성화함)
  isEnabled: process.env.NEXT_PUBLIC_ENABLE_AGI !== 'false',

  // 세션 스토리지 키
  storageKey: 'cowork26:jjapvis:hud_token',

  // 기본 HUD 윈도우 규격 (사이버네틱 와이드 가로형 대시보드 및 우측 미디어 패널 지원)
  defaultWidth: 1280,
  defaultHeight: 740,
  minWidth: 540,
  minHeight: 460,

  // 구글 OAuth 2.0 설정
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
} as const

// 사용자별 격리 HUD 접속 URL 생성함
export function getJjapvisHudUrl(token: string): string {
  const base = `${JJAPVIS_CONFIG.serverUrl}/hud/hud.html`
  const v = '20260918_notimeout'
  return token
    ? `${base}?hud_token=${encodeURIComponent(token)}&v=${v}`
    : `${base}?v=${v}`
}

// 짭비스 백엔드 실시간 WebSocket URL 생성함
export function getJjapvisWsUrl(token: string): string {
  const httpUrl = JJAPVIS_CONFIG.serverUrl
  const wsProto = httpUrl.startsWith('https://') ? 'wss://' : 'ws://'
  const host = httpUrl.replace(/^https?:\/\//, '')
  const base = `${wsProto}${host}/ws/hud`
  return token ? `${base}?hud_token=${encodeURIComponent(token)}` : base
}
