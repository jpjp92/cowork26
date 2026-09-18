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
