'use client'

import { useRef, useState } from 'react'
import type { PageDropPosition, PageRecord } from '../../lib/notion-lite/types'

interface PageTreeProps {
  tree: Map<string, PageRecord[]>
  activePageId: string
  collapsedPageIds: Set<string>
  canEdit: boolean
  onOpen: (pageId: string) => void
  onToggleCollapse: (pageId: string) => void
  onCreateChild: (pageId: string) => void
  onRequestDelete: (pageId: string) => void
  onDownloadMarkdown: (page: PageRecord) => void
  onMove: (draggedId: string, targetId: string, position: PageDropPosition) => void
}

export function PageTree({
  tree,
  activePageId,
  collapsedPageIds,
  canEdit,
  onOpen,
  onToggleCollapse,
  onCreateChild,
  onRequestDelete,
  onDownloadMarkdown,
  onMove,
}: PageTreeProps) {
  const draggedIdRef = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<{ id: string; position: PageDropPosition } | null>(null)
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)

  const renderItems = (parentId: string | null, depth = 0): React.ReactNode => {
    const items = tree.get(parentId ?? 'root') ?? []
    return items.map(page => {
      const hasChildren = (tree.get(page.id)?.length ?? 0) > 0
      const isCollapsed = collapsedPageIds.has(page.id)
      const isActive = page.id === activePageId

      return (
        <div key={page.id}>
          {dragOver?.id === page.id && dragOver.position === 'above' && (
            <div className="h-0.5 rounded bg-[#baf7c8]" style={{ marginLeft: depth > 0 ? 32 : 0 }} />
          )}
          <div
            className={`group/page-row relative flex items-center gap-1 rounded-[4px] ${
              depth > 0 ? 'pl-3' : ''
            } ${
              dragOver?.id === page.id && dragOver.position === 'inside' ? 'bg-[#50504d] ring-2 ring-[#baf7c8]' : ''
            }`}
            draggable={canEdit}
            onDragStart={() => { draggedIdRef.current = page.id }}
            onDragEnd={() => { draggedIdRef.current = null; setDragOver(null) }}
            onDragOver={event => {
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              const relativeY = event.clientY - rect.top
              const position: PageDropPosition = (
                relativeY < rect.height * 0.25
                  ? 'above'
                  : relativeY > rect.height * 0.75
                    ? 'below'
                    : 'inside'
              )
              setDragOver(previous => (
                previous?.id === page.id && previous.position === position
                  ? previous
                  : { id: page.id, position }
              ))
            }}
            onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null)
            }}
            onDrop={event => {
              event.preventDefault()
              const draggedId = draggedIdRef.current
              if (draggedId) onMove(draggedId, page.id, dragOver?.position ?? 'below')
              draggedIdRef.current = null
              setDragOver(null)
            }}
          >
            {depth > 0 && (
              <div className={`absolute -left-px top-1/2 h-px w-3 ${isActive ? 'bg-[#baf7c8]' : 'bg-[#6e6e6b]'}`} />
            )}

            <button
              type="button"
              onClick={event => { event.stopPropagation(); if (hasChildren) onToggleCollapse(page.id) }}
              className={`flex h-8 w-5 shrink-0 items-center justify-center transition-colors ${
                hasChildren ? 'cursor-pointer text-neutral-400 hover:text-white' : 'pointer-events-none opacity-0'
              }`}
            >
              <svg
                className={`h-2.5 w-2.5 transition-transform duration-150 ${hasChildren && !isCollapsed ? 'rotate-90' : ''}`}
                viewBox="0 0 8 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1.5 1L6.5 6L1.5 11" />
              </svg>
            </button>

            <button
              onClick={() => { setOpenActionsId(null); onOpen(page.id) }}
              className={`flex min-h-11 min-w-0 flex-1 items-center rounded-[4px] px-2 text-left text-sm transition-colors md:min-h-8 ${
                isActive
                  ? 'border border-black bg-[#baf7c8] font-black text-black shadow-[2px_2px_0_#000]'
                  : 'font-medium text-neutral-300 hover:bg-[#50504d] hover:text-white'
              }`}
            >
              <span className="block min-w-0 truncate">{page.title}</span>
            </button>

            <div className="hidden shrink-0 gap-1 pl-1 opacity-0 transition-opacity group-hover/page-row:opacity-100 group-focus-within/page-row:opacity-100 md:flex">
              {canEdit && (
                <button
                  onClick={() => onCreateChild(page.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs text-neutral-400 hover:bg-[#50504d] hover:text-white"
                  title="하위 페이지 추가"
                >
                  +
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => onRequestDelete(page.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs text-neutral-400 hover:text-red-300"
                  title="페이지 삭제"
                >
                  ×
                </button>
              )}
              <button
                onClick={() => onDownloadMarkdown(page)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs text-neutral-400 hover:bg-[#50504d] hover:text-white"
                title="마크다운으로 다운로드"
              >
                ↓
              </button>
            </div>
            <button
              type="button"
              aria-label={`${page.title} 페이지 작업`}
              aria-expanded={openActionsId === page.id}
              onClick={event => {
                event.stopPropagation()
                setOpenActionsId(current => current === page.id ? null : page.id)
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-lg font-black text-neutral-200 hover:bg-[#50504d] hover:text-white md:hidden"
            >
              ⋯
            </button>
            {openActionsId === page.id && (
              <div
                role="menu"
                aria-label={`${page.title} 페이지 작업`}
                className="absolute right-0 top-[calc(100%+4px)] z-30 w-44 rounded-[8px] border border-black bg-[#50504d] p-1.5 text-white shadow-[4px_4px_0_#000] md:hidden"
              >
                {canEdit && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setOpenActionsId(null); onCreateChild(page.id) }}
                    className="min-h-11 w-full rounded-[6px] px-3 text-left text-sm font-bold hover:bg-[#62625f]"
                  >
                    하위 페이지 추가
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setOpenActionsId(null); onDownloadMarkdown(page) }}
                  className="min-h-11 w-full rounded-[6px] px-3 text-left text-sm font-bold hover:bg-[#62625f]"
                >
                  마크다운 다운로드
                </button>
                {canEdit && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setOpenActionsId(null); onRequestDelete(page.id) }}
                    className="min-h-11 w-full rounded-[6px] px-3 text-left text-sm font-bold text-red-200 hover:bg-[#62625f]"
                  >
                    페이지 삭제
                  </button>
                )}
              </div>
            )}
          </div>

          {dragOver?.id === page.id && dragOver.position === 'below' && (
            <div className="h-0.5 rounded bg-[#baf7c8]" style={{ marginLeft: depth > 0 ? 32 : 0 }} />
          )}

          {!isCollapsed && hasChildren && (
            <div className="ml-5 border-l border-[#6e6e6b]">
              {renderItems(page.id, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return renderItems(null)
}
