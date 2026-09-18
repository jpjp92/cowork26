'use client'

// 짭비스 HUD 윈도우 컨테이너 패널 컴포넌트임 (드래그 리사이즈 및 와이드 뷰 지원)
import { ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import type { JjapvisViewMode } from '../../lib/jjapvis/types'
import { JJAPVIS_CONFIG } from '../../lib/jjapvis/config'

interface JjapvisPanelProps {
  isOpen: boolean
  viewMode: JjapvisViewMode
  onClose: () => void
  onToggleMaximize: () => void
  onMinimize: () => void
  children: ReactNode
}

const STORAGE_SIZE_KEY = 'cowork26:jjapvis:panel_size'

export function JjapvisPanel({
  isOpen,
  viewMode,
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
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

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
      // 로드 실패 시 기본값 사용함
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
          maxHeight: 'calc(100vh - 5rem)',
        }

  const containerClasses = isMaximized
    ? 'fixed inset-4 z-50 rounded-xl'
    : isMinimized
      ? 'fixed bottom-20 right-6 z-50 w-80 h-12 rounded-lg'
      : 'fixed bottom-20 right-6 z-50 rounded-xl'

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
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#111827] border-b-2 border-black text-[#5eead4] select-none">
        <div className="flex items-center space-x-2 pl-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider">
            JJAPVIS AGI // NEURAL HUD
          </span>
          {!isMaximized && !isMinimized && (
            <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
              ({size.width} × {size.height})
            </span>
          )}
        </div>

        {/* 윈도우 컨트롤 버튼 그룹임 */}
        <div className="flex items-center space-x-1.5">
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

      {/* 내부 iframe 렌더링 영역임 */}
      {!isMinimized && (
        <div className="flex-1 w-full h-full relative overflow-hidden bg-black">
          {children}
        </div>
      )}
    </div>
  )
}
