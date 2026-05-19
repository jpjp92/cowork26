'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

const AGI_HUD_URL = (process.env.NEXT_PUBLIC_JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777') + '/hud/hud.html'

export default function FloatingAiButton() {
  const [y, setY] = useState(300)
  const [panelOpen, setPanelOpen] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [launching, setLaunching] = useState(false)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startTop = useRef(0)
  const moved = useRef(false)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      dragging.current = true
      moved.current = false
      startY.current = e.clientY
      startTop.current = y
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [y],
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return
    const dy = e.clientY - startY.current
    if (Math.abs(dy) > 4) moved.current = true
    const newY = Math.max(8, Math.min(window.innerHeight - 160, startTop.current + dy))
    setY(newY)
  }, [])

  const onPointerUp = useCallback(async () => {
    dragging.current = false
    if (!moved.current) {
      // 패널 열기/닫기 토글
      setPanelOpen(prev => !prev)
      // 최초 1회만 exe 백그라운드 실행
      if (!launched) {
        setLaunching(true)
        try {
          await fetch('/api/agi', { method: 'POST' })
          setLaunched(true)
        } finally {
          setLaunching(false)
        }
      }
    }
  }, [launched])

  // 페이지 종료 시 exe kill
  useEffect(() => {
    const handleUnload = () => {
      navigator.sendBeacon('/api/agi', JSON.stringify({ _method: 'DELETE' }))
      fetch('/api/agi', { method: 'DELETE', keepalive: true }).catch(() => {})
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  return (
    <>
      {/* ── 짭비스 HUD 패널 ── */}
      {panelOpen && (
        <div
          className="fixed right-[140px] z-40 flex flex-col overflow-hidden rounded-[12px] border-2 border-blue-400 bg-black shadow-[0_0_30px_6px_#3b82f660]"
          style={{ top: Math.max(8, y - 100), width: 820, height: 600 }}
        >
          {/* 패널 타이틀바 */}
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-blue-400/40 bg-black/90 px-3">
            <span className="text-[11px] font-black tracking-widest text-blue-300 drop-shadow-[0_0_5px_#3b82f6]">
              ◈ 짭비스 시스템
            </span>
            <button
              onClick={() => setPanelOpen(false)}
              className="text-xs font-black text-blue-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          {/* HUD iframe */}
          <iframe
            src={AGI_HUD_URL}
            className="h-full w-full border-none bg-black"
            allow="microphone; camera"
            title="짭비스 HUD"
          />
        </div>
      )}

      {/* ── 플로팅 버튼 ── */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ top: y }}
        className={[
          'fixed right-3 z-50',
          'flex h-[120px] w-[120px] cursor-grab touch-none select-none flex-col items-center justify-center gap-1',
          'rounded-full border-2 border-white bg-black/80 backdrop-blur-sm',
          panelOpen
            ? 'shadow-[0_0_24px_8px_#3b82f6,0_0_48px_16px_#3b82f660,inset_0_0_16px_#1e40af]'
            : 'shadow-[0_0_10px_2px_#3b82f6,0_0_22px_6px_#3b82f640,inset_0_0_8px_#1e3a8a]',
          'transition-shadow duration-200',
          'hover:shadow-[0_0_16px_5px_#60a5fa,0_0_36px_10px_#3b82f660,inset_0_0_12px_#1e40af]',
          'active:cursor-grabbing active:scale-95',
          launching ? 'animate-pulse' : '',
        ].join(' ')}
        title="짭비스 실행"
      >
        <div className="relative h-20 w-20 overflow-hidden rounded-full border border-blue-400/60 shadow-[0_0_6px_#3b82f6]">
          <Image
            src="/ai-image.png"
            alt="짭비스"
            fill
            className="object-cover"
            draggable={false}
          />
        </div>
      </button>
    </>
  )
}
