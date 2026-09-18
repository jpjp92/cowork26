'use client'

// 짭비스 HUD 윈도우 컨테이너 패널 컴포넌트임 (생각 과정 HUD, 우측 미디어 패널, 구글 계정 연동, 와이드 뷰 지원)
import { ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import type { JjapvisViewMode, JjapvisThoughtStep, JjapvisMediaItem } from '../../lib/jjapvis/types'
import type { GoogleAuthUser } from '../../lib/jjapvis/google-auth'
import { JJAPVIS_CONFIG } from '../../lib/jjapvis/config'
import { JjapvisThinkingBar } from './jjapvis-thinking-bar'
import { JjapvisMediaDrawer } from './jjapvis-media-drawer'

interface JjapvisPanelProps {
  isOpen: boolean
  viewMode: JjapvisViewMode
  googleUser: GoogleAuthUser | null
  isLoggingIn: boolean
  isThinking?: boolean
  currentStep?: string
  thoughtHistory?: JjapvisThoughtStep[]
  aiState?: string
  mediaList?: JjapvisMediaItem[]
  onClearThoughts?: () => void
  onClearMedia?: () => void
  onGoogleLogin: () => void
  onGoogleLogout: () => void
  onClose: () => void
  onToggleMaximize: () => void
  onMinimize: () => void
  children: ReactNode
}

const STORAGE_SIZE_KEY = 'cowork26:jjapvis:panel_size'

export function JjapvisPanel({
  isOpen,
  viewMode,
  googleUser,
  isLoggingIn,
  isThinking = false,
  currentStep = '',
  thoughtHistory = [],
  aiState = 'idle',
  mediaList = [],
  onClearThoughts,
  onClearMedia,
  onGoogleLogin,
  onGoogleLogout,
  onClose,
  onToggleMaximize,
  onMinimize,
  children,
}: JjapvisPanelProps) {
  // 사용자가 조절한 창 크기 상태 관리함
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: JJAPVIS_CONFIG.defaultWidth,
    height: JJAPVIS_CONFIG.defaultHeight,
  })
  const [isResizing, setIsResizing] = useState(false)
  const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  // 미디어가 새로 추가되면 미디어 드로어 자동 열기 지원함
  const prevMediaCountRef = useRef(mediaList.length)
  useEffect(() => {
    if (mediaList.length > prevMediaCountRef.current) {
      setIsMediaDrawerOpen(true)
    }
    prevMediaCountRef.current = mediaList.length
  }, [mediaList.length])

  // 저장된 크기 로드함
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SIZE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.width && parsed.height) {
          setSize({
            width: Math.max(JJAPVIS_CONFIG.minWidth, parsed.width),
            height: Math.max(JJAPVIS_CONFIG.minHeight, parsed.height),
          })
        }
      }
    } catch {
      // 무시함
    }
  }, [])

  // 리사이즈 드래그 시작 핸들러임 (좌측 상단 모서리)
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    }
  }, [size])

  // 리사이즈 드래그 중 및 종료 이벤트 처리함
  useEffect(() => {
    if (!isResizing) return

    const handlePointerMove = (e: PointerEvent) => {
      if (!resizeRef.current) return
      const deltaX = resizeRef.current.startX - e.clientX
      const deltaY = resizeRef.current.startY - e.clientY

      const newW = Math.min(
        window.innerWidth - 32,
        Math.max(JJAPVIS_CONFIG.minWidth, resizeRef.current.startW + deltaX)
      )
      const newH = Math.min(
        window.innerHeight - 60,
        Math.max(JJAPVIS_CONFIG.minHeight, resizeRef.current.startH + deltaY)
      )

      setSize({ width: newW, height: newH })
    }

    const handlePointerUp = () => {
      setIsResizing(false)
      resizeRef.current = null
      try {
        localStorage.setItem(STORAGE_SIZE_KEY, JSON.stringify(size))
      } catch {
        // 무시함
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing, size])

  if (!isOpen) return null

  const isMaximized = viewMode === 'maximized'
  const isMinimized = viewMode === 'minimized'

  // 창 크기 및 스타일 계산함
  const containerStyle = isMaximized
    ? undefined
    : isMinimized
      ? undefined
      : {
          width: `${size.width}px`,
          height: `${size.height}px`,
          maxWidth: 'calc(100vw - 2rem)',
          maxHeight: 'calc(100vh - 4rem)',
        }

  const containerClasses = isMaximized
    ? 'fixed inset-4 z-50 rounded-xl'
    : isMinimized
      ? 'fixed bottom-20 right-6 z-50 w-96 h-12 rounded-lg'
      : 'fixed bottom-14 right-6 z-50 rounded-xl'

  return (
    <div
      className={`flex flex-col overflow-hidden border-2 border-black bg-black shadow-[8px_8px_0_#000] ${
        isResizing ? 'select-none transition-none' : 'transition-all duration-150'
      } ${containerClasses}`}
      style={containerStyle}
    >
      {/* 리사이즈 드래그 핸들임 (좌측 상단 모서리) */}
      {!isMaximized && !isMinimized && (
        <div
          onPointerDown={handleResizeStart}
          title="드래그하여 크기 조절"
          className="absolute top-0 left-0 z-30 w-4 h-4 cursor-nwse-resize hover:bg-[#5eead4]/40 flex items-center justify-center group"
        >
          <div className="w-2 h-2 border-t-2 border-l-2 border-[#5eead4] opacity-60 group-hover:opacity-100" />
        </div>
      )}

      {/* HUD 상단 타이틀바임 */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#111827] border-b-2 border-black text-[#5eead4] select-none gap-2 shrink-0">
        <div className="flex items-center space-x-2 pl-2 shrink-0 overflow-hidden">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isThinking ? 'bg-[#10b981] animate-ping' : 'bg-[#10b981]'
            }`}
          />
          <span className="text-xs font-mono font-bold tracking-wider shrink-0">
            JJAPVIS AGI // NEURAL HUD
          </span>
          {/* 최소화 모드일 때 표시되는 인라인 상태 요약임 */}
          {isMinimized && (
            <span className="text-[11px] font-mono text-[#a7f3d0] truncate ml-2">
              {isThinking ? `🧠 ${currentStep || '추론 중...'}` : 'READY'}
            </span>
          )}
          {!isMaximized && !isMinimized && (
            <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
              ({size.width} × {size.height})
            </span>
          )}
        </div>

        {/* 구글 사용자 계정 연동 영역, 미디어 토글 및 컨트롤 버튼임 */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* 우측 미디어 갤러리 토글 버튼임 */}
          {!isMinimized && (
            <button
              onClick={() => setIsMediaDrawerOpen((prev) => !prev)}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all border shadow-[1px_1px_0_#000] ${
                isMediaDrawerOpen
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-400'
                  : 'bg-[#1e293b] hover:bg-[#334155] text-slate-300 border-slate-700'
              }`}
              title="우측 미디어 갤러리 토글"
            >
              <span>🖼️ 미디어</span>
              <span className="px-1 py-0.2 rounded-full bg-black/40 text-[10px] text-cyan-300">
                {mediaList.length}
              </span>
            </button>
          )}

          {/* 구글 개인 계정 연동 버튼 및 뱃지임 */}
          {googleUser ? (
            <div className="flex items-center space-x-1.5 bg-[#064e3b] border border-[#10b981] px-2 py-0.5 rounded text-[11px] font-mono text-[#a7f3d0]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              <span className="truncate max-w-[100px] sm:max-w-[160px]" title={googleUser.email}>
                {googleUser.email}
              </span>
              <button
                onClick={onGoogleLogout}
                title="구글 연동 해제"
                className="ml-1 text-slate-300 hover:text-red-400 font-bold"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={onGoogleLogin}
              disabled={isLoggingIn}
              title="사용자 개인 구글 쿼터 사용을 위해 연동함"
              className="flex items-center space-x-1 bg-[#1e293b] hover:bg-[#334155] border border-[#f59e0b] text-[#fbbf24] px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all shadow-[1px_1px_0_#000] active:translate-y-0.5"
            >
              <span>{isLoggingIn ? '인증 진행 중...' : '🔐 구글 연동'}</span>
            </button>
          )}

          {/* 윈도우 컨트롤 버튼 그룹임 */}
          <div className="flex items-center space-x-1">
            <button
              onClick={onMinimize}
              title={isMinimized ? '복원' : '최소화'}
              className="w-5 h-5 flex items-center justify-center rounded border border-black bg-[#374151] hover:bg-[#4b5563] text-white text-xs font-mono transition-colors shadow-[1px_1px_0_#000]"
            >
              _
            </button>
            <button
              onClick={onToggleMaximize}
              title={isMaximized ? '기본 크기로 복원' : '최대화'}
              className="w-5 h-5 flex items-center justify-center rounded border border-black bg-[#374151] hover:bg-[#4b5563] text-white text-xs font-mono transition-colors shadow-[1px_1px_0_#000]"
            >
              {isMaximized ? '❐' : '□'}
            </button>
            <button
              onClick={onClose}
              title="닫기"
              className="w-5 h-5 flex items-center justify-center rounded border border-black bg-[#ef4444] hover:bg-[#dc2626] text-white text-xs font-mono transition-colors shadow-[1px_1px_0_#000]"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* 생각 과정 실시간 사이버네틱 HUD 바임 */}
      {!isMinimized && (
        <JjapvisThinkingBar
          isThinking={isThinking}
          currentStep={currentStep}
          thoughtHistory={thoughtHistory}
          aiState={aiState}
          onClearHistory={onClearThoughts}
        />
      )}

      {/* 내부 본체 영역 (iframe + 우측 미디어 갤러리 드로어) */}
      {!isMinimized && (
        <div className="flex-1 w-full h-full relative overflow-hidden bg-black flex flex-row">
          {/* 짭비스 원형 HUD iframe 영역임 */}
          <div className="flex-1 h-full relative overflow-hidden">
            {children}
          </div>

          {/* 우측 미디어 갤러리 패널임 */}
          <JjapvisMediaDrawer
            isOpen={isMediaDrawerOpen}
            mediaList={mediaList}
            onClose={() => setIsMediaDrawerOpen(false)}
            onClear={onClearMedia || (() => {})}
          />
        </div>
      )}
    </div>
  )
}
