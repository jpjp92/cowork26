'use client'

// 짭비스 연동 모듈의 모든 UI, 브리지 로직, 백엔드 세션 활성화, 구글 계정 인증을 캡슐화한 최상위 위젯 컴포넌트임
import { useState, useRef, useEffect, useCallback } from 'react'
import { JJAPVIS_CONFIG } from '../../lib/jjapvis/config'
import type { ActivePageContext, JjapvisViewMode } from '../../lib/jjapvis/types'
import { getOrCreateHudToken } from '../../lib/jjapvis/token-manager'
import {
  getGoogleAuthSession,
  openGoogleLoginPopup,
  logoutGoogle,
  registerTokenToJjapvis,
  type GoogleAuthUser,
} from '../../lib/jjapvis/google-auth'
import { JjapvisFloatingButton } from './jjapvis-floating-button'
import { JjapvisPanel } from './jjapvis-panel'
import { JjapvisIframe } from './jjapvis-iframe'
import { useJjapvisBridge } from './use-jjapvis-bridge'
import { useJjapvisAgentSession } from './use-jjapvis-agent-session'
import { markdownToTiptap } from '../../lib/markdown-to-tiptap'

export interface JjapvisWidgetProps {
  activePage: ActivePageContext | null
  userId?: string | null
  onPageCreated?: (page: { title: string; content: Record<string, unknown> }) => Promise<void> | void
}

export function JjapvisWidget({ activePage, userId, onPageCreated }: JjapvisWidgetProps) {
  // 환경변수로 비활성화된 경우 렌더링 생략함
  if (!JJAPVIS_CONFIG.isEnabled) {
    return null
  }

  const [isOpen, setIsOpen] = useState(false)
  const [viewMode, setViewMode] = useState<JjapvisViewMode>('normal')
  const [token, setToken] = useState<string>('')
  const [googleUser, setGoogleUser] = useState<GoogleAuthUser | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // 사용자별 1:1 격리 세션 토큰 및 구글 로그인 상태 로드함
  useEffect(() => {
    const loadedToken = getOrCreateHudToken(userId)
    setToken(loadedToken)

    const savedGoogleUser = getGoogleAuthSession()
    if (savedGoogleUser) {
      setGoogleUser(savedGoogleUser)
      // 짭비스 백엔드로 사용자 토큰 재등록 보장함
      registerTokenToJjapvis(savedGoogleUser.email, savedGoogleUser.accessToken).catch(() => {})
    }
  }, [userId])

  // 짭비스 백엔드가 save_file 이벤트로 산출물을 스트리밍할 때 코워크 웹 워크스페이스에 신규 페이지로 즉시 자동 생성함
  const handleSaveFile = useCallback(async (file: {
    filename: string
    content: string
    b64_data: string
    category?: string
  }) => {
    if (!onPageCreated) return

    // 파일 확장자 분리 및 제목 포맷팅
    const cleanTitle = file.filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]/g, ' ')
      .trim() || 'Jjapvis 산출물 문서'

    // 마크다운 파싱하여 Tiptap Doc 형식으로 변환함
    const tiptapDoc = markdownToTiptap(file.content)

    try {
      await onPageCreated({
        title: cleanTitle,
        content: tiptapDoc,
      })
    } catch (err) {
      console.error('[JjapvisWidget] 코워크 페이지 자동 생성 실패함:', err)
    }
  }, [onPageCreated])

  // 짭비스 백엔드 에이전트 세션(/ws/agent)을 백그라운드로 항시 유지하여,
  // 짭비스 백엔드가 생각과정(progress)과 우측 미디어(media), 파일 산출물(save_file)을 100% 정상 송출하도록 보장함
  useJjapvisAgentSession({
    token,
    googleAccessToken: googleUser?.accessToken,
    onSaveFile: handleSaveFile,
  })

  // 구글 팝업 로그인 실행 핸들러임
  const handleGoogleLogin = useCallback(async () => {
    if (isLoggingIn) return
    setIsLoggingIn(true)
    try {
      const authUser = await openGoogleLoginPopup()
      setGoogleUser(authUser)
    } catch (err: any) {
      console.warn('[JjapvisWidget] 구글 로그인 취소 또는 실패함:', err?.message || err)
    } finally {
      setIsLoggingIn(false)
    }
  }, [isLoggingIn])

  // 구글 연동 해제 핸들러임
  const handleGoogleLogout = useCallback(() => {
    logoutGoogle()
    setGoogleUser(null)
  }, [])

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
    setViewMode((prev) => (prev === 'maximized' ? 'normal' : 'maximized'))
  }

  // 최소화 토글 핸들러임
  const toggleMinimize = () => {
    setViewMode((prev) => (prev === 'minimized' ? 'normal' : 'minimized'))
  }

  return (
    <>
      {/* 화면 우측 하단 플로팅 토글 버튼임 */}
      <JjapvisFloatingButton
        isOpen={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      />

      {/* 짭비스 홀로그램 HUD 윈도우 패널임 (짭비스 원형 100% 일치) */}
      <JjapvisPanel
        isOpen={isOpen}
        viewMode={viewMode}
        googleUser={googleUser}
        isLoggingIn={isLoggingIn}
        onGoogleLogin={handleGoogleLogin}
        onGoogleLogout={handleGoogleLogout}
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
