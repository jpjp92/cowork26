'use client'

import Image from 'next/image'
import { useCallback, useRef, useState } from 'react'

export default function FloatingAiButton() {
  const [y, setY] = useState(300)
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
    const newY = Math.max(8, Math.min(window.innerHeight - 80, startTop.current + dy))
    setY(newY)
  }, [])

  const onPointerUp = useCallback(async () => {
    dragging.current = false
    if (!moved.current) {
      setLaunching(true)
      try {
        await fetch('/api/agi', { method: 'POST' })
      } finally {
        setLaunching(false)
      }
    }
  }, [])

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ top: y }}
      className={[
        'fixed right-3 z-50',
        'flex h-[68px] w-[68px] cursor-grab touch-none select-none flex-col items-center justify-center gap-1',
        'rounded-full border-2 border-white bg-black/80 backdrop-blur-sm',
        'shadow-[0_0_10px_2px_#3b82f6,0_0_22px_6px_#3b82f640,inset_0_0_8px_#1e3a8a]',
        'transition-shadow duration-200',
        'hover:shadow-[0_0_16px_5px_#60a5fa,0_0_36px_10px_#3b82f660,inset_0_0_12px_#1e40af]',
        'active:cursor-grabbing active:scale-95',
        launching ? 'animate-pulse' : '',
      ].join(' ')}
      title="짭비스 실행"
    >
      <div className="relative h-9 w-9 overflow-hidden rounded-full border border-blue-400/60 shadow-[0_0_6px_#3b82f6]">
        <Image
          src="/ai-image.png"
          alt="짭비스"
          fill
          className="object-cover"
          draggable={false}
        />
      </div>
      <span className="text-[9px] font-black tracking-widest text-blue-300 drop-shadow-[0_0_5px_#3b82f6]">
        {launching ? '···' : '짭비스'}
      </span>
    </button>
  )
}
