'use client'

import type { CSSProperties, PointerEventHandler, RefObject } from 'react'
import type { PageDropPosition, PageRecord, Workspace } from '../../lib/notion-lite/types'
import { getWorkspaceRoleSymbol } from '../../lib/notion-lite/roles'
import { PageTreeSkeleton } from './loading-states'
import { PageTree } from './page-tree'
import { WorkspaceMenu } from './workspace-menu'

interface WorkspaceSidebarProps {
  sidebarWidth: number
  menuContainerRef: RefObject<HTMLDivElement | null>
  menuOpen: boolean
  activeWorkspace?: Workspace
  activeWorkspaceId: string
  workspaces: Workspace[]
  workspacesLoading: boolean
  workspaceName: string
  creatingWorkspace: boolean
  renameWorkspaceName: string
  renamingWorkspace: boolean
  canManageMembers: boolean
  canEdit: boolean
  pages: PageRecord[]
  pagesLoading: boolean
  pageTree: Map<string, PageRecord[]>
  activePageId: string
  collapsedPageIds: Set<string>
  newPageTitle: string
  creatingPage: boolean
  onToggleMenu: () => void
  onWorkspaceNameChange: (name: string) => void
  onCreateWorkspace: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onReorderWorkspaces: (sourceId: string, targetId: string, position: 'before' | 'after') => void
  onRenameWorkspaceNameChange: (name: string) => void
  onRenameWorkspace: () => void
  onSearch: () => void
  onNewPageTitleChange: (title: string) => void
  onCreatePage: (parentId?: string | null) => void
  onOpenPage: (pageId: string) => void
  onTogglePageCollapse: (pageId: string) => void
  onRequestDeletePage: (pageId: string) => void
  onDownloadMarkdown: (page: PageRecord) => void
  onMovePage: (draggedId: string, targetId: string, position: PageDropPosition) => void
  onResizeStart: PointerEventHandler<HTMLButtonElement>
}

export function WorkspaceSidebar({
  sidebarWidth,
  menuContainerRef,
  menuOpen,
  activeWorkspace,
  activeWorkspaceId,
  workspaces,
  workspacesLoading,
  workspaceName,
  creatingWorkspace,
  renameWorkspaceName,
  renamingWorkspace,
  canManageMembers,
  canEdit,
  pages,
  pagesLoading,
  pageTree,
  activePageId,
  collapsedPageIds,
  newPageTitle,
  creatingPage,
  onToggleMenu,
  onWorkspaceNameChange,
  onCreateWorkspace,
  onSelectWorkspace,
  onReorderWorkspaces,
  onRenameWorkspaceNameChange,
  onRenameWorkspace,
  onSearch,
  onNewPageTitleChange,
  onCreatePage,
  onOpenPage,
  onTogglePageCollapse,
  onRequestDeletePage,
  onDownloadMarkdown,
  onMovePage,
  onResizeStart,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className="relative flex w-full shrink-0 flex-col border-r border-black bg-[#62625f] md:w-[var(--sidebar-width)] max-md:border-r-0 max-md:border-b"
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <div className="border-b border-black p-3">
        <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-normal text-white">Workspace</p>
        <div className="relative mb-2" ref={menuContainerRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
            className="grid min-h-14 w-full grid-cols-[36px_minmax(0,1fr)_28px] items-center gap-2.5 rounded-[8px] border border-black bg-[#50504d] p-2 text-left text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#f7f4ec] hover:text-black hover:shadow-[3px_3px_0_#000] focus:-translate-y-0.5 focus:bg-[#f7f4ec] focus:text-black focus:shadow-[3px_3px_0_#000] focus:outline-none"
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-[8px] border border-black bg-[#baf7c8] text-[15px] font-black leading-none text-black"
              title={activeWorkspace ? `권한: ${activeWorkspace.role}` : '워크스페이스 상태'}
              aria-hidden="true"
            >
              {getWorkspaceRoleSymbol(activeWorkspace?.role)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black uppercase">
                {activeWorkspace?.name ?? '워크스페이스 선택'}
              </span>
              <span className="mt-0.5 block text-[11px] font-black uppercase opacity-80">
                {activeWorkspace ? `${activeWorkspace.role} · ${pages.length} pages` : `${workspaces.length} workspaces`}
              </span>
            </span>
            <span className="workspace-chevron grid h-7 w-7 place-items-center rounded-[8px] border border-black bg-[#baf7c8]" />
          </button>

          {menuOpen && (
            <WorkspaceMenu
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              workspaceName={workspaceName}
              creatingWorkspace={creatingWorkspace}
              onWorkspaceNameChange={onWorkspaceNameChange}
              onCreateWorkspace={onCreateWorkspace}
              onSelectWorkspace={onSelectWorkspace}
              onReorderWorkspaces={onReorderWorkspaces}
            />
          )}
        </div>

        {canManageMembers && activeWorkspace && (
          <div className="mb-2 flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
              placeholder="워크스페이스 이름"
              value={renameWorkspaceName}
              onChange={event => onRenameWorkspaceNameChange(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && onRenameWorkspace()}
            />
            <button
              onClick={onRenameWorkspace}
              disabled={!renameWorkspaceName.trim() || renamingWorkspace}
              className="h-9 w-9 shrink-0 rounded-[8px] border border-black bg-white text-sm font-black leading-none text-black shadow-[2px_2px_0_#000] hover:bg-[#baf7c8] disabled:opacity-40"
              title="워크스페이스 이름 저장"
            >
              {renamingWorkspace ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span> : '✓'}
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-[11px] font-black uppercase tracking-normal text-white">Pages</p>
          <div className="flex items-center gap-1.5">
            <span className="border border-black bg-[#baf7c8] px-1.5 text-xs font-black text-black">{pages.length}</span>
            <button
              type="button"
              onClick={onSearch}
              disabled={!activeWorkspaceId}
              aria-label="페이지 검색"
              className="flex h-6 w-6 items-center justify-center border border-black bg-[#50504d] text-sm font-black leading-none text-white shadow-[2px_2px_0_#000] hover:bg-[#baf7c8] hover:text-black disabled:opacity-40"
            >
              ⌕
            </button>
          </div>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-[8px] border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
            placeholder="새 페이지"
            value={newPageTitle}
            onChange={event => onNewPageTitleChange(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && onCreatePage()}
            disabled={!activeWorkspaceId || !canEdit}
          />
          <button
            onClick={() => onCreatePage()}
            disabled={!activeWorkspaceId || !canEdit || creatingPage}
            className="h-9 w-9 shrink-0 rounded-[8px] border border-black bg-[#50504d] text-sm font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000] disabled:opacity-40"
          >
            {creatingPage ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span> : '+'}
          </button>
        </div>
        <div className="page-tree-scroll min-h-0 flex-1 overflow-y-auto max-md:max-h-56">
          {workspacesLoading && workspaces.length === 0 ? (
            <PageTreeSkeleton />
          ) : activeWorkspaceId ? (
            pages.length > 0 ? (
              <PageTree
                tree={pageTree}
                activePageId={activePageId}
                collapsedPageIds={collapsedPageIds}
                canEdit={canEdit}
                onOpen={onOpenPage}
                onToggleCollapse={onTogglePageCollapse}
                onCreateChild={onCreatePage}
                onRequestDelete={onRequestDeletePage}
                onDownloadMarkdown={onDownloadMarkdown}
                onMove={onMovePage}
              />
            ) : pagesLoading ? (
              <PageTreeSkeleton />
            ) : (
              <div className="border border-dashed border-black bg-[#50504d] px-3 py-8 text-center">
                <p className="text-sm font-black text-white">첫 페이지를 만들어보세요.</p>
                <p className="mt-1 text-xs font-bold text-neutral-100">회의록, 체크리스트, 자료 정리부터 시작할 수 있습니다.</p>
              </div>
            )
          ) : (
            <div className="border border-dashed border-black bg-[#50504d] px-3 py-8 text-center">
              <p className="text-sm font-black text-white">워크스페이스가 필요합니다.</p>
              <p className="mt-1 text-xs font-bold text-neutral-100">팀 문서를 묶을 공간을 먼저 만드세요.</p>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        aria-label="사이드바 크기 조절"
        className="absolute -right-1.5 top-0 z-20 hidden h-full w-3 cursor-col-resize touch-none border-x border-transparent bg-transparent transition-colors hover:border-black hover:bg-[#baf7c8]/60 active:bg-[#baf7c8] md:block"
        onPointerDown={onResizeStart}
      />
    </aside>
  )
}
