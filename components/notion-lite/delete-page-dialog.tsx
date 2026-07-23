'use client'

import { useEffect } from 'react'
import type { PageRecord } from '../../lib/notion-lite/types'

interface DeletePageDialogProps {
  page: PageRecord | null
  hasChildren: boolean
  onCancel: () => void
  onConfirm: (pageId: string) => void
}

export function DeletePageDialog({ page, hasChildren, onCancel, onConfirm }: DeletePageDialogProps) {
  useEffect(() => {
    if (!page) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [page, onCancel])

  if (!page) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-[8px] border border-black bg-[#62625f] p-5 text-white shadow-[6px_6px_0_#000]"
        onPointerDown={event => event.stopPropagation()}
      >
        <p className="text-sm font-black uppercase tracking-normal text-white">페이지 삭제</p>
        <p className="mt-3 text-sm font-medium leading-relaxed text-neutral-100">
          <span className="font-black text-white">{page.title || 'Untitled'}</span>
          {hasChildren
            ? ' 페이지와 모든 하위 페이지를 삭제합니다.'
            : ' 페이지를 삭제합니다.'}
          {' 되돌릴 수 없습니다.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-[8px] border border-black bg-[#50504d] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#f7f4ec] hover:text-black hover:shadow-[3px_3px_0_#000]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(page.id)}
            className="h-9 rounded-[8px] border border-black bg-[#fca5a5] px-4 text-xs font-black uppercase text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#f87171] hover:shadow-[3px_3px_0_#000]"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}
