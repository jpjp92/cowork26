// 코워크 에디터 컨텍스트와 짭비스 iframe 간 양방향 postMessage 브리지 훅임
import { useEffect, useCallback, RefObject } from 'react'
import type { ActivePageContext, JjapvisParentMessage, JjapvisChildMessage } from '../../lib/jjapvis/types'
import { tiptapToMarkdown } from '../../lib/tiptap-to-markdown'

interface UseJjapvisBridgeProps {
  iframeRef: RefObject<HTMLIFrameElement | null>
  activePage: ActivePageContext | null
  onControlAction?: (action: 'minimize' | 'maximize' | 'restore' | 'close') => void
}

export function useJjapvisBridge({
  iframeRef,
  activePage,
  onControlAction,
}: UseJjapvisBridgeProps) {
  // 현재 코워크 문서의 마크다운 컨텍스트를 iframe으로 전송함
  const sendCurrentPageContext = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow || !activePage) return

    let markdown = ''
    try {
      markdown = tiptapToMarkdown(activePage.title, activePage.content || null)
    } catch (err) {
      console.error('[JjapvisBridge] 마크다운 변환 실패함:', err)
    }

    const promptHeader = [
      '[코워크(Cowork26) 연동 업무 모드]',
      '코워크 업무 수행 및 지원을 위한 요청입니다.',
      '분석 내용, 연구 결과, 작성된 문서나 보고서, 코드 등 결과물 파일은 공통 저장 도구(save_file_to_client)를 통해 저장해 주시면 코워크(Cowork26) 워크스페이스 신규 페이지로 즉시 자동 동기화 및 생성됩니다.',
      '',
      `[현재 열람 중인 코워크 문서: "${activePage.title || '제목 없음'}"]`,
      markdown || '(문서 내용 비어 있음)',
    ].join('\n')

    const message: JjapvisParentMessage = {
      type: 'page_context',
      title: activePage.title,
      pageId: activePage.id,
      context: promptHeader,
    }

    // 짭비스 iframe 내부로 postMessage 발행함
    iframe.contentWindow.postMessage(message, '*')
  }, [iframeRef, activePage])

  // 페이지 내용 변경 시 컨텍스트 자동 동기화함
  useEffect(() => {
    sendCurrentPageContext()
  }, [sendCurrentPageContext])

  // iframe 내부에서 발생하는 이벤트 수신함
  useEffect(() => {
    function handleMessage(event: MessageEvent<JjapvisChildMessage>) {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'request_context') {
        sendCurrentPageContext()
      } else if (data.type === 'window_control' && data.action && onControlAction) {
        onControlAction(data.action)
      } else if (data.type === 'jjapvis:open_web' && data.url) {
        try {
          window.open(data.url, '_blank', 'noopener,noreferrer')
        } catch (e) {
          console.warn('[JjapvisBridge] 웹 화면 팝업 실패:', e)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendCurrentPageContext, onControlAction])

  return { sendCurrentPageContext }
}
