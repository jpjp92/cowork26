'use client'

// 짭비스 홀로그램 HUD 웹 UI를 임베드하는 샌드박스 iframe 컴포넌트임
import { useState, forwardRef } from 'react'
import { getJjapvisHudUrl } from '../../lib/jjapvis/config'

interface JjapvisIframeProps {
  token: string
  onLoad?: () => void
}

export const JjapvisIframe = forwardRef<HTMLIFrameElement, JjapvisIframeProps>(
  function JjapvisIframe({ token, onLoad }, ref) {
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const hudUrl = getJjapvisHudUrl(token)

    return (
      <div className="relative w-full h-full bg-black overflow-hidden select-none">
        {/* 로딩 인디케이터임 */}
        {isLoading && !loadError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d1117] text-[#5eead4]">
            <div className="w-10 h-10 border-4 border-[#5eead4]/20 border-t-[#5eead4] rounded-full animate-spin mb-3" />
            <span className="text-xs font-mono tracking-widest animate-pulse">
              CONNECTING TO JJAPVIS HUD...
            </span>
          </div>
        )}

        {/* 연결 실패 안내임 */}
        {loadError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-[#0f172a] text-center text-white">
            <div className="text-red-400 font-bold mb-2">HUD 연결 실패</div>
            <p className="text-xs text-slate-400 mb-4">
              짭비스 백엔드 서버가 실행 중인지 확인바람. ({hudUrl})
            </p>
            <button
              onClick={() => {
                setLoadError(false)
                setIsLoading(true)
              }}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded text-xs font-bold transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 짭비스 홀로그램 HUD Iframe임 */}
        <iframe
          ref={ref}
          src={hudUrl}
          title="Jjapvis Hologram HUD"
          className="w-full h-full border-none"
          allow="microphone; camera; display-capture; clipboard-read; clipboard-write"
          onLoad={() => {
            setIsLoading(false)
            if (onLoad) onLoad()
          }}
          onError={() => {
            setIsLoading(false)
            setLoadError(true)
          }}
        />
      </div>
    )
  }
)
