'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ContextMenuProps {
  label: string
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}

export function ContextMenu({ label, x, y, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const padding = 8
    const rect = menu.getBoundingClientRect()
    setPosition({
      x: Math.max(padding, Math.min(x, window.innerWidth - rect.width - padding)),
      y: Math.max(padding, Math.min(y, window.innerHeight - rect.height - padding)),
    })
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [x, y])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const handleViewportChange = () => onClose()

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] rounded-[8px] border border-black bg-[#50504d] p-1.5 text-white shadow-[4px_4px_0_#000] md:inset-x-auto md:bottom-auto md:left-[var(--context-menu-x)] md:top-[var(--context-menu-y)] md:w-52"
      style={{
        '--context-menu-x': `${position.x}px`,
        '--context-menu-y': `${position.y}px`,
      } as CSSProperties}
    >
      {children}
    </div>,
    document.body,
  )
}

interface ContextMenuItemProps {
  children: ReactNode
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
}

export function ContextMenuItem({ children, onSelect, disabled = false, destructive = false }: ContextMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`min-h-11 w-full rounded-[6px] px-3 text-left text-sm font-bold outline-none hover:bg-[#62625f] focus-visible:bg-[#baf7c8] focus-visible:text-black disabled:cursor-not-allowed disabled:opacity-40 ${destructive ? 'text-red-200' : ''}`}
    >
      {children}
    </button>
  )
}
