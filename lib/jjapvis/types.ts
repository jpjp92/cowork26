// 짭비스 연동 프로토콜 및 데이터 타입 정의 모듈임

// 부모(코워크) -> 짭비스(iframe) 전달 메시지 타입임
export interface JjapvisParentMessage {
  type: 'page_context'
  context: string
  title?: string
  pageId?: string
  images?: string[]
}

// 짭비스(iframe) -> 부모(코워크) 수신 메시지 타입임
export interface JjapvisChildMessage {
  type: 'save_file' | 'hud_state' | 'window_control' | 'request_context' | 'jjapvis:open_web'
  action?: 'minimize' | 'maximize' | 'restore' | 'close'
  state?: string
  filename?: string
  data?: string
  url?: string
  title?: string
  view_id?: string
}

// 짭비스 윈도우 뷰 모드임
export type JjapvisViewMode = 'normal' | 'maximized' | 'minimized'

// 활성 문서 컨텍스트 인터페이스임
export interface ActivePageContext {
  id: string
  title: string
  content?: Record<string, unknown> | null
}

// 짭비스 미디어 아이템 타입 (이미지, 동영상, 차트, 오디오 등)
export interface JjapvisMediaItem {
  id: string
  type: 'image' | 'video' | 'audio' | 'chart' | 'map' | 'screenshot' | 'image_url' | '3d_model' | 'html_widget' | 'text_dashboard'
  data: string
  caption?: string
  timestamp: number
  is_background?: boolean
  bg_name?: string
  link?: string
}

// 짭비스 실시간 생각 과정 및 추론 단계 타입임
export interface JjapvisThoughtStep {
  id: string
  text: string
  timestamp: number
  is_background?: boolean
  status?: 'running' | 'done' | 'error'
  elapsedSec?: number
}
