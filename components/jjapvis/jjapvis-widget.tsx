'use client'

// 짭비스 연동 모듈의 모든 UI 및 브리지 로직을 캡슐화한 최상위 위젯 컴포넌트임
import { useState, useRef, useEffect, useMemo } from 'react'
import { JJAPVIS_CONFIG } from '../../lib/jjapvis/config'
import type { ActivePageContext, JjapvisViewMode } from '../../lib/jjapvis/types'
import { getOrCreateHudToken } from '../../lib/jjapvis/token-manager'
import { JjapvisFloatingButton } from './jjapvis-floating-button'
import { JjapvisPanel } from './jjapvis-panel'
import { JjapvisIframe } from './jjapvis-iframe'
import { useJjapvisBridge } from './use-jjapvis-bridge'

export interface JjapvisWidgetProps {
  activePage: ActivePageContext | null
  userId?: string | null
}

export function JjapvisWidget({ activePage, userId }: JjapvisWidgetProps) {
  // 환경변수로 비활성화된 경우 렌더링 생략함
  if (!JJAPVIS_CONFIG.isEnabled) {
    return null
  }

  const [isOpen, setIsOpen] = useState(false)
  const [viewMode, setViewMode] = useState<JjapvisViewMode>('normal')
  const [token, setToken] = useState<string>('')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // 사용자별 1:1 격리 세션 토큰 로드함
  useEffect(() => {
    const loadedToken = getOrCreateHudToken(userId)
    setToken(loadedToken)
  }, [userId])

  // iframe 컨트롤 액션 핸들러임
  const handleControlAction = (action: 'minimize' | 'maximize' | 'restore' | 'close') => {
    if (action === 'close') {
      setIsOpen(false)
    } else if (action === 'minimize') {
      setViewMode('minimized')
    } else if (action === 'maximize') {
      setViewMode('maximized')
    } else if (action === 'restore') {
      setViewMode('normal')
    }
  }

  // 코워크 문서 변경 시 짭비스 iframe과 실시간 컨텍스트 동기화함
  useJjapvisBridge({
    iframeRef,
    activePage,
    onControlAction: handleControlAction,
  })

  // 최대화 토글 핸들러임
  const toggleMaximize = () => {
    setViewMode(prev => (prev === 'maximized' ? 'normal' : 'maximized'))
  }

  // 최소화 토글 핸들러임
  const toggleMinimize = () => {
    setViewMode(prev => (prev === 'minimized' ? 'normal' : 'minimized'))
  }

  return (
    <>
      {/* 화면 우측 하단 플로팅 토글 버튼임 */}
      <JjapvisFloatingButton
        isOpen={isOpen}
        onClick={() => setIsOpen(prev => !prev)}
      />

      {/* 짭비스 홀로그램 HUD 윈도우 패널임 */}
      <JjapvisPanel
        isOpen={isOpen}
        viewMode={viewMode}
        onClose={() => setIsOpen(false)}
        onToggleMaximize={toggleMaximize}
        onMinimize={toggleMinimize}
      >
        {token && (
          <JjapvisIframe
            ref={iframeRef}
            token={token}
          />
        )}
      </JjapvisPanel>
    </>
  )
}
