'use client'

import type { ReactNode } from 'react'

export function UtilityPanel({
  id,
  title,
  description,
  closeLabel,
  onClose,
  children,
  footer,
  tone = 'light',
}: {
  id: string
  title: string
  description?: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex justify-end md:top-16 md:items-start md:p-3" role="presentation">
      <button type="button" aria-label={closeLabel} onClick={onClose} className="pointer-events-auto absolute inset-0 bg-black/45 md:hidden" />
      <section
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={`pointer-events-auto relative flex h-full w-full flex-col overflow-hidden border-black shadow-none md:h-auto md:max-h-[calc(100dvh-5.5rem)] md:w-[min(22rem,calc(100vw-1.5rem))] md:rounded-[8px] md:border md:shadow-[5px_5px_0_#000] ${dark ? 'bg-[#50504d] text-white' : 'bg-[#f7f4ec] text-black'}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black bg-[#50504d] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white md:px-3 md:py-2.5">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="truncate text-sm font-black">{title}</h2>
            {description && <p className="mt-0.5 truncate text-[11px] font-medium text-neutral-200">{description}</p>}
          </div>
          <button type="button" aria-label={closeLabel} onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-black bg-[#62625f] text-xl font-black text-white md:h-9 md:w-9">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
        {footer && <footer className={`shrink-0 border-t border-black p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${dark ? 'bg-[#50504d]' : 'bg-[#f7f4ec]'}`}>{footer}</footer>}
      </section>
    </div>
  )
}
