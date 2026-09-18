'use client'

// 짭비스 HUD 윈도우 컨테이너 패널 컴포넌트임
import { ReactNode } from 'react'
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

export function JjapvisPanel({
  isOpen,
  viewMode,
  onClose,
  onToggleMaximize,
  onMinimize,
  children,
}: JjapvisPanelProps) {
  if (!isOpen) return null

  // 뷰 모드별 크기 및 위치 스타일 계산함
  const isMaximized = viewMode === 'maximized'
  const isMinimized = viewMode === 'minimized'

  const containerClasses = isMaximized
    ? 'fixed inset-4 z-50 rounded-xl'
    : isMinimized
      ? 'fixed bottom-20 right-6 z-50 w-72 h-12 rounded-lg'
      : 'fixed bottom-20 right-6 z-50 w-[460px] h-[740px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-6rem)] rounded-xl'

  return (
    <div
      className={`flex flex-col overflow-hidden border-2 border-black bg-black shadow-[6px_6px_0_#000] transition-all duration-200 ${containerClasses}`}
      style={{
        minWidth: isMinimized ? undefined : JJAPVIS_CONFIG.minWidth,
        minHeight: isMinimized ? undefined : JJAPVIS_CONFIG.minHeight,
      }}
    >
      {/* HUD 상단 타이틀바임 */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#111827] border-b-2 border-black text-[#5eead4] select-none">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider">
            JJAPVIS AGI // HUD
          </span>
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
