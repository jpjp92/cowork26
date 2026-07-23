'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSidebarWidthOptions {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function useSidebarWidth({ storageKey, defaultWidth, minWidth, maxWidth }: UseSidebarWidthOptions) {
  const [sidebarWidth, setSidebarWidth] = useState(defaultWidth)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(storageKey))
    if (!Number.isFinite(savedWidth)) return
    setSidebarWidth(clampNumber(savedWidth, minWidth, maxWidth))
  }, [maxWidth, minWidth, storageKey])

  useEffect(() => () => resizeCleanupRef.current?.(), [])

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.innerWidth < 768) return

    event.preventDefault()
    resizeCleanupRef.current?.()

    const startX = event.clientX
    const startWidth = sidebarWidth
    let nextWidth = startWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const cleanup = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      resizeCleanupRef.current = null
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampNumber(startWidth + moveEvent.clientX - startX, minWidth, maxWidth)
      setSidebarWidth(nextWidth)
    }

    const handlePointerUp = () => {
      window.localStorage.setItem(storageKey, String(Math.round(nextWidth)))
      cleanup()
    }

    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }, [maxWidth, minWidth, sidebarWidth, storageKey])

  return { sidebarWidth, startSidebarResize }
}
