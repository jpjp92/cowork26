'use client'

import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'

export function useOutsidePointerDown<T extends HTMLElement>(
  active: boolean,
  containerRef: RefObject<T | null>,
  onOutside: () => void,
) {
  const onOutsideRef = useRef(onOutside)
  onOutsideRef.current = onOutside

  useEffect(() => {
    if (!active) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!containerRef.current?.contains(event.target)) {
        onOutsideRef.current()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [active, containerRef])
}
