'use client'

// 짭비스 실시간 AI 생각 과정 및 추론 단계 시각화 사이버네틱 HUD 바 컴포넌트임
import { useState } from 'react'
import type { JjapvisThoughtStep } from '../../lib/jjapvis/types'

interface JjapvisThinkingBarProps {
  isThinking: boolean
  currentStep: string
  thoughtHistory: JjapvisThoughtStep[]
  aiState: string
  onClearHistory?: () => void
}

export function JjapvisThinkingBar({
  isThinking,
  currentStep,
  thoughtHistory,
  aiState,
  onClearHistory,
}: JjapvisThinkingBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasHistory = thoughtHistory.length > 0
  const displayText = isThinking
    ? currentStep || '두뇌 신경망 추론 및 플로우 연산 진행 중...'
    : hasHistory
      ? '최근 추론 완료'
      : '신경망 대기 중 (STANDBY)'

  return (
    <div className="flex flex-col border-b border-[#1f293d] bg-[#070d18] text-[#5eead4] font-mono select-none text-xs">
      {/* HUD 헤더 상태 바임 */}
      <div className="flex items-center justify-between px-3 py-1.5 gap-2">
        <div className="flex items-center space-x-2 overflow-hidden flex-1">
          {/* 상태 펄스 인디케이터임 */}
          <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
            {isThinking ? (
              <>
                <span className="absolute w-3 h-3 rounded-full bg-[#10b981]/40 animate-ping" />
                <span className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
              </>
            ) : (
              <span className="w-2 h-2 rounded-full bg-[#3b82f6]/60" />
            )}
          </div>

          {/* 태그 뱃지임 */}
          <span
            className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 border ${
              isThinking
                ? 'bg-[#064e3b] text-[#34d399] border-[#10b981]/50'
                : 'bg-[#1e293b] text-slate-400 border-slate-700'
            }`}
          >
            {isThinking ? 'THINKING' : aiState.toUpperCase()}
          </span>

          {/* 현재 진행 중인 생각 텍스트임 */}
          <span
            className={`truncate text-[11px] ${
              isThinking ? 'text-[#a7f3d0] font-semibold' : 'text-slate-400'
            }`}
            title={displayText}
          >
            {isThinking && (
              <span className="inline-block animate-spin mr-1 text-[#10b981]">◐</span>
            )}
            {displayText}
          </span>
        </div>

        {/* 우측 로그 펼침 토글 버튼임 */}
        <div className="flex items-center space-x-1 shrink-0">
          {hasHistory && (
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#0f172a] hover:bg-[#1e293b] text-[11px] text-[#93c5fd] border border-cyan-900/60 transition-colors shadow-[1px_1px_0_#000]"
              title="상세 추론 단계 로그 토글"
            >
              <span>{isExpanded ? '▲ 접기' : '▼ 생각 과정'}</span>
              <span className="text-[10px] px-1 rounded-full bg-[#1e293b] text-[#67e8f9] font-bold">
                {thoughtHistory.length}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 펼쳐진 상세 추론 로그 아코디언 드로어임 */}
      {isExpanded && hasHistory && (
        <div className="max-h-56 overflow-y-auto bg-[#020617] border-t border-[#1e293b] p-2 space-y-1.5 text-[11px] shadow-inner">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800 text-[10px] text-slate-500 font-bold tracking-wider">
            <span>추론 및 에이전트 실행 파이프라인 히스토리</span>
            {onClearHistory && (
              <button
                onClick={onClearHistory}
                className="hover:text-red-400 transition-colors text-[10px]"
              >
                지우기
              </button>
            )}
          </div>
          {thoughtHistory.map((step) => {
            const timeStr = new Date(step.timestamp).toTimeString().slice(0, 8)
            const isDone = step.status === 'done'
            const isError = step.status === 'error'

            return (
              <div
                key={step.id}
                className={`flex items-start space-x-2 px-2 py-1 rounded border transition-colors ${
                  step.is_background
                    ? 'bg-[#1f0b24]/60 border-[#e879f9]/30 text-[#f0abfc]'
                    : isError
                      ? 'bg-[#2a0808]/60 border-red-500/40 text-red-300'
                      : isDone
                        ? 'bg-[#06241b]/50 border-[#10b981]/30 text-[#6ee7b7]'
                        : 'bg-[#0f172a]/70 border-cyan-800/40 text-[#bae6fd]'
                }`}
              >
                <span className="text-[10px] text-slate-500 shrink-0 select-none">
                  {timeStr}
                </span>
                <span className="shrink-0 font-bold">
                  {isError ? '✕' : isDone ? '✓' : step.is_background ? '⚙' : '▶'}
                </span>
                <span className="flex-1 break-all leading-relaxed">
                  {step.text}
                </span>
                {typeof step.elapsedSec === 'number' && step.elapsedSec > 0 && (
                  <span className="text-[10px] text-emerald-400 shrink-0">
                    +{step.elapsedSec}s
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
