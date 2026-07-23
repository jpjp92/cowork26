'use client'

import { useRef, useState } from 'react'
import type { Workspace } from '../../lib/notion-lite/types'
import { getRoleBadgeClass } from '../../lib/notion-lite/roles'

interface WorkspaceMenuProps {
  workspaces: Workspace[]
  activeWorkspaceId: string
  workspaceName: string
  creatingWorkspace: boolean
  onWorkspaceNameChange: (name: string) => void
  onCreateWorkspace: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onReorderWorkspaces: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}

export function WorkspaceMenu({
  workspaces,
  activeWorkspaceId,
  workspaceName,
  creatingWorkspace,
  onWorkspaceNameChange,
  onCreateWorkspace,
  onSelectWorkspace,
  onReorderWorkspaces,
}: WorkspaceMenuProps) {
  const draggedIdRef = useRef<string | null>(null)
  const dragClickBlockedRef = useRef(false)
  const [dragOver, setDragOver] = useState<{ id: string; position: 'before' | 'after' } | null>(null)

  return (
    <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-full rounded-[8px] border border-black bg-[#50504d] p-2.5 text-white shadow-[5px_5px_0_#000]" role="menu">
      <div className="mb-2 flex items-center justify-between border-b border-black px-0.5 pb-2.5">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase">Switch workspace</p>
          <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-100">워크 스페이스 생성 및 위치 변경 </p>
        </div>
        <span className="shrink-0 border border-black bg-[#baf7c8] px-1.5 text-[11px] font-black text-black">
          {workspaces.length}
        </span>
      </div>

      <div className="grid max-h-56 gap-1.5 overflow-y-auto py-1 pr-0.5">
        {workspaces.map(workspace => {
          const isActive = workspace.id === activeWorkspaceId
          const dragPosition = dragOver?.id === workspace.id ? dragOver.position : null

          return (
            <button
              key={workspace.id}
              type="button"
              draggable
              role="menuitem"
              aria-current={isActive}
              title="드래그해서 순서 변경"
              onClick={event => {
                if (dragClickBlockedRef.current) {
                  event.preventDefault()
                  dragClickBlockedRef.current = false
                  return
                }
                onSelectWorkspace(workspace.id)
              }}
              onDragStart={event => {
                draggedIdRef.current = workspace.id
                dragClickBlockedRef.current = true
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', workspace.id)
              }}
              onDragOver={event => {
                const draggedId = draggedIdRef.current
                if (!draggedId || draggedId === workspace.id) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const rect = event.currentTarget.getBoundingClientRect()
                const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                setDragOver({ id: workspace.id, position })
              }}
              onDragLeave={() => {
                setDragOver(current => current?.id === workspace.id ? null : current)
              }}
              onDrop={event => {
                const draggedId = draggedIdRef.current
                if (!draggedId || draggedId === workspace.id) return
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                setDragOver(null)
                onReorderWorkspaces(draggedId, workspace.id, position)
              }}
              onDragEnd={() => {
                draggedIdRef.current = null
                setDragOver(null)
                window.setTimeout(() => { dragClickBlockedRef.current = false }, 0)
              }}
              className={[
                'grid w-full cursor-grab grid-cols-[6px_minmax(0,1fr)_auto_14px] items-center gap-1.5 rounded-[8px] border border-black bg-[#62625f] p-1.5 text-left text-white active:cursor-grabbing',
                'hover:bg-[#f7f4ec] hover:text-black',
                isActive ? 'bg-[#242421] text-white hover:bg-[#242421] hover:text-white' : '',
                dragPosition === 'before' ? 'shadow-[inset_0_3px_0_#baf7c8]' : '',
                dragPosition === 'after' ? 'shadow-[inset_0_-3px_0_#baf7c8]' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className={`h-[30px] w-1.5 rounded-full border ${isActive ? 'border-white bg-[#baf7c8]' : 'border-black bg-transparent'}`} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-black uppercase leading-tight">{workspace.name}</span>
                <span className="mt-0.5 block text-[9px] font-black uppercase leading-none opacity-75">workspace</span>
              </span>
              <span className={`min-w-[42px] rounded-full border border-black px-1 py-0.5 text-center text-[9px] font-black uppercase leading-none ${getRoleBadgeClass(workspace.role)}`}>
                {workspace.role}
              </span>
              <span className="min-w-3.5 text-center text-xs font-black leading-none">{isActive ? '✓' : ''}</span>
            </button>
          )
        })}
      </div>

      <form
        className="mt-2 border-t border-black pt-2.5"
        onSubmit={event => { event.preventDefault(); onCreateWorkspace() }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_38px] items-center gap-2">
          <input
            className="h-[38px] min-w-0 rounded-[8px] border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555] focus:shadow-[3px_3px_0_#000]"
            placeholder="새 워크스페이스"
            value={workspaceName}
            onChange={event => onWorkspaceNameChange(event.target.value)}
          />
          <button
            type="submit"
            disabled={!workspaceName.trim() || creatingWorkspace}
            className={`${creatingWorkspace ? '' : 'workspace-plus'} relative h-[38px] rounded-[8px] border border-black bg-[#baf7c8] text-black shadow-[2px_2px_0_#000] disabled:opacity-40`}
            title="워크스페이스 생성"
            aria-label="워크스페이스 생성"
          >
            {creatingWorkspace ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span> : null}
          </button>
        </div>
      </form>
    </div>
  )
}
