'use client'

import { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthPanel from './auth-panel'
import FloatingAiButton from './floating-ai-button'
import { DeletePageDialog } from './notion-lite/delete-page-dialog'
import { DocumentPane } from './notion-lite/document-pane'
import { AppHeader } from './notion-lite/app-header'
import { WorkspaceSidebar } from './notion-lite/workspace-sidebar'
import type {
  PageDropPosition,
  PageRecord,
  Workspace,
} from '../lib/notion-lite/types'
import {
  buildPageTree,
  getPageTrail,
} from '../lib/notion-lite/page-tree'
import { notionLiteApi } from '../lib/notion-lite/api'
import { supabase } from '../lib/supabase-browser'
import { tiptapToMarkdown } from '../lib/tiptap-to-markdown'
import { SearchModal } from './search-modal'
import { useSidebarWidth } from '../hooks/use-sidebar-width'
import { useCollapsedPages } from '../hooks/use-collapsed-pages'
import { useOutsidePointerDown } from '../hooks/use-outside-pointer-down'
import { useWorkspaceData } from '../hooks/use-workspace-data'
import { usePageData } from '../hooks/use-page-data'
import { usePagePersistence } from '../hooks/use-page-persistence'
import { useSelectionNavigation } from '../hooks/use-selection-navigation'
import { usePageAssets } from '../hooks/use-page-assets'

const ENABLE_AGI = process.env.NEXT_PUBLIC_ENABLE_AGI === 'true'
const PAGE_REVALIDATE_INTERVAL_MS = 30_000
const DEFAULT_SIDEBAR_WIDTH = 312
const MIN_SIDEBAR_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 520
const SIDEBAR_WIDTH_STORAGE_KEY = 'cowork26:sidebar-width'
// 사이드바 페이지 접힘 상태를 워크스페이스별로 저장하는 localStorage 키 프리픽스
const COLLAPSED_STORAGE_PREFIX = 'cowork26:collapsed:'
// depth 기반 기본 접힘: 이 depth 이상(자식 있는 노드)은 '첫 방문 시' 접힌 상태로 시작.
// 0 = 최상위만 노출(전부 접힘), 1 = 최상위+1뎁스 노출, ...
// 저장된 접힘 상태가 있으면 그 값이 우선하며, 이 기본값은 적용되지 않는다.
const AUTO_COLLAPSE_FROM_DEPTH = 0

interface NotionLiteAppProps {
  initialWorkspaceId?: string
  initialPageId?: string
}

export default function NotionLiteApp({ initialWorkspaceId = '', initialPageId = '' }: NotionLiteAppProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('')
  const [renameWorkspaceName, setRenameWorkspaceName] = useState('')
  const [newPageTitle, setNewPageTitle] = useState('')
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const settingsRef = useRef<HTMLDivElement>(null)
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const workspacesRef = useRef<Workspace[]>([])
  const accessToken = session?.access_token
  const {
    workspaces,
    workspacesLoading,
    members,
    membersLoading,
    creatingWorkspace,
    renamingWorkspace,
    inviteLoading,
    loadWorkspaces: fetchWorkspaces,
    createWorkspace: createWorkspaceRecord,
    renameWorkspace: renameWorkspaceRecord,
    reorderWorkspaces: reorderWorkspaceRecords,
    loadMembers,
    inviteMember: inviteWorkspaceMember,
    resetWorkspaceData,
  } = useWorkspaceData(accessToken)
  const findPageRef = useRef<(pageId: string) => PageRecord | null>(() => null)
  const seedResolvedPageRef = useRef<(page: PageRecord) => boolean>(() => false)
  const getFallbackWorkspaceIdRef = useRef<() => string>(() => '')
  const resetSavingStatusRef = useRef<() => void>(() => {})
  const {
    activeWorkspaceId,
    activePageId,
    activeWorkspaceIdRef,
    activePageIdRef,
    selectActivePage,
    replaceLoadedPageSelection,
    openPage,
    selectWorkspace: selectWorkspaceNavigation,
    selectWorkspacePage,
    replaceWorkspaceSelection,
    takeStandalonePageRequest,
    tryActivateStandalonePage,
    resetSelection,
  } = useSelectionNavigation({
    initialWorkspaceId,
    initialPageId,
    accessToken,
    findPageRef,
    seedResolvedPageRef,
    getFallbackWorkspaceIdRef,
    resetSavingStatusRef,
  })
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId)
  const canEdit = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'editor'
  const canManageMembers = activeWorkspace?.role === 'owner'
  const pageSavedHandlerRef = useRef<(page: PageRecord) => void>(() => {})
  const {
    savingStatus: saving,
    visibleSavingStatus,
    saveTimers,
    pendingContent,
    contentSaveInFlight,
    pendingCreateIds,
    showSavingStatus,
    resetSavingStatus,
    updatePage,
    scheduleContentSave,
    flushPendingContentSaves,
    getEffectiveContent,
    clearPagePersistence,
    markPageCreating,
    finishPageCreating,
    rememberTitle,
    consumePreviousTitle,
    resetPagePersistence,
  } = usePagePersistence({
    accessToken,
    canEdit,
    activePageIdRef,
    onPageSavedRef: pageSavedHandlerRef,
    onError: setError,
  })
  resetSavingStatusRef.current = resetSavingStatus
  const showPageLoadedStatus = useCallback(() => showSavingStatus('loaded'), [showSavingStatus])
  const {
    pages,
    setPages,
    pagesLoading,
    loadedPagesWorkspaceId,
    creatingPage,
    pagesRef,
    pagesCache,
    pageFetchedAtRef,
    loadPages,
    createPage: createPageRecord,
    deletePage: deletePageRecord,
    movePage: movePageRecord,
    resetPageData,
  } = usePageData({
    accessToken,
    activeWorkspaceId,
    activePageId,
    activeWorkspaceIdRef,
    activePageIdRef,
    saveTimers,
    pendingContent,
    contentSaveInFlight,
    pendingCreateIds,
    clearPagePersistence,
    markPageCreating,
    finishPageCreating,
    onLoadedPageSelection: replaceLoadedPageSelection,
    selectActivePage,
    showLoadedStatus: showPageLoadedStatus,
    onError: setError,
    revalidateIntervalMs: PAGE_REVALIDATE_INTERVAL_MS,
  })
  findPageRef.current = pageId => {
    const currentPage = pagesRef.current.find(page => page.id === pageId)
    if (currentPage) return currentPage
    for (const workspacePages of pagesCache.current.values()) {
      const cachedPage = workspacePages.find(page => page.id === pageId)
      if (cachedPage) return cachedPage
    }
    return null
  }
  seedResolvedPageRef.current = page => {
    if (!workspacesRef.current.some(workspace => workspace.id === page.workspace_id)) return false
    const cached = pagesCache.current.get(page.workspace_id) ?? []
    const nextPages = cached.some(item => item.id === page.id)
      ? cached.map(item => item.id === page.id ? page : item)
      : [...cached, page]
    pagesCache.current.set(page.workspace_id, nextPages)
    pagesRef.current = nextPages
    pageFetchedAtRef.current.set(page.id, Date.now())
    setPages(nextPages)
    return true
  }
  getFallbackWorkspaceIdRef.current = () => workspacesRef.current[0]?.id ?? ''
  pageSavedHandlerRef.current = page => {
    pageFetchedAtRef.current.set(page.id, Date.now())
    setPages(previous => previous.map(item => (
      item.id === page.id ? { ...page, content: getEffectiveContent(page) } : item
    )))
  }
  const { sidebarWidth, startSidebarResize } = useSidebarWidth({
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
    defaultWidth: DEFAULT_SIDEBAR_WIDTH,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
  })
  const {
    collapsedPageIds,
    togglePage: togglePageCollapse,
    expandPage,
    revealAncestors,
  } = useCollapsedPages({
    workspaceId: activeWorkspaceId,
    pages,
    pagesReady: loadedPagesWorkspaceId === activeWorkspaceId,
    storagePrefix: COLLAPSED_STORAGE_PREFIX,
    collapseFromDepth: AUTO_COLLAPSE_FROM_DEPTH,
  })
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const activePage = pages.find(page => page.id === activePageId) ?? null
  const activePageContent = activePage ? getEffectiveContent(activePage) : null
  const deleteTarget = deleteTargetId ? pages.find(page => page.id === deleteTargetId) ?? null : null
  const deleteTargetHasChildren = deleteTargetId
    ? pages.some(page => page.parent_id === deleteTargetId)
    : false

  const activePageTrail = useMemo(() => {
    return activePage ? getPageTrail(activePage.id, pages) : []
  }, [activePage, pages])

  const activePageBreadcrumbPrefix = [
    activeWorkspace?.name,
    ...activePageTrail.slice(0, -1).map(page => page.title),
  ].filter((label): label is string => Boolean(label))

  useOutsidePointerDown(settingsOpen, settingsRef, () => setSettingsOpen(false))
  useOutsidePointerDown(workspaceMenuOpen, workspaceMenuRef, () => setWorkspaceMenuOpen(false))

  useEffect(() => {
    workspacesRef.current = workspaces
  }, [workspaces])

  // 검색 등으로 페이지를 열 때, 접힌 조상들을 펼쳐 사이드바에서 해당 페이지가 보이게 한다.
  const revealPage = useCallback((pageId: string) => {
    revealAncestors(pageId)
    openPage(pageId)
  }, [openPage, revealAncestors])
  const { uploadImage, cloneImage } = usePageAssets(
    accessToken,
    activeWorkspaceId,
    activePageIdRef,
  )

  const resetClientState = useCallback(() => {
    setSession(null)
    resetWorkspaceData()
    resetPageData()
    resetPagePersistence()
    workspacesRef.current = []
    resetSelection()
    setSettingsOpen(false)
  }, [resetPageData, resetPagePersistence, resetSelection, resetWorkspaceData])

  const loadWorkspaces = useCallback(async () => {
    if (!accessToken) return
    setError('')
    const standaloneRequest = takeStandalonePageRequest()
    const [data, standalonePage] = await Promise.all([
      fetchWorkspaces(),
      standaloneRequest
        ? notionLiteApi.getPage(accessToken, standaloneRequest.pageId).catch(() => null)
        : Promise.resolve(null),
    ])
    if (!data) return
    workspacesRef.current = data

    if (standaloneRequest) {
      if (tryActivateStandalonePage(standaloneRequest, standalonePage)) return data
      setError('요청한 페이지를 열 수 없어 기본 워크스페이스로 이동했습니다.')
    }

    const currentWorkspaceId = activeWorkspaceIdRef.current
    const nextWorkspaceId = data.some(workspace => workspace.id === currentWorkspaceId)
      ? currentWorkspaceId
      : data[0]?.id || ''
    if (nextWorkspaceId !== currentWorkspaceId) {
      replaceWorkspaceSelection(nextWorkspaceId)
    }
    return data
  }, [
    accessToken,
    fetchWorkspaces,
    replaceWorkspaceSelection,
    takeStandalonePageRequest,
    tryActivateStandalonePage,
  ])

  useEffect(() => {
    const bootstrapSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        const isInvalidRefreshToken = sessionError.message.includes('Invalid Refresh Token')
        if (isInvalidRefreshToken) {
          await supabase.auth.signOut({ scope: 'local' })
          resetClientState()
        } else {
          setError(sessionError.message)
        }
        setAuthLoading(false)
        return
      }

      setSession(data.session)
      setAuthLoading(false)
    }

    bootstrapSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
      if (!nextSession) {
        resetClientState()
      }
    })

    return () => subscription.unsubscribe()
  }, [resetClientState])

  useEffect(() => {
    if (!accessToken) return
    loadWorkspaces().catch(err => setError(err instanceof Error ? err.message : '오류가 발생했습니다.'))
  }, [accessToken, loadWorkspaces])

  useEffect(() => {
    setRenameWorkspaceName(activeWorkspace?.name ?? '')
  }, [activeWorkspace?.id, activeWorkspace?.name])

  useEffect(() => {
    if (!settingsOpen || !activeWorkspaceId) return
    loadMembers(activeWorkspaceId).catch(err => setError(err instanceof Error ? err.message : '오류가 발생했습니다.'))
  }, [settingsOpen, activeWorkspaceId, loadMembers])

  const pageTree = useMemo(() => buildPageTree(pages), [pages])

  const createWorkspace = async () => {
    if (!workspaceName.trim() || !accessToken || creatingWorkspace) return
    setError('')
    try {
      const data = await createWorkspaceRecord(workspaceName.trim())
      if (!data) return
      setWorkspaceName('')
      setWorkspaceMenuOpen(false)
      if (data.page) {
        pageFetchedAtRef.current.set(data.page.id, Date.now())
        setPages([data.page])
        selectWorkspacePage(data.workspace.id, data.page.id, 'push')
      } else {
        selectWorkspacePage(data.workspace.id, '', 'push')
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '워크스페이스를 만들지 못했습니다.')
    }
  }

  const selectWorkspace = (workspaceId: string) => {
    selectWorkspaceNavigation(workspaceId)
    setWorkspaceMenuOpen(false)
  }

  const reorderWorkspaces = async (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => {
    setError('')

    try {
      await reorderWorkspaceRecords(sourceId, targetId, position)
    } catch (err) {
      setError(err instanceof Error ? err.message : '워크스페이스 순서를 저장하지 못했습니다.')
    }
  }

  const createPage = async (parentId: string | null = null) => {
    if (!activeWorkspaceId || !accessToken || !canEdit || creatingPage) return
    setError('')
    const title = newPageTitle.trim() || 'Untitled'
    setNewPageTitle('')
    try {
      await createPageRecord({
        workspaceId: activeWorkspaceId,
        parentId,
        title,
        onOpen: openPage,
        onSelectionChange: replaceLoadedPageSelection,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '페이지를 만들지 못했습니다.')
    }
  }

  const renameWorkspace = async () => {
    if (!accessToken || !activeWorkspaceId || !renameWorkspaceName.trim() || !canManageMembers || renamingWorkspace) return
    setError('')
    try {
      await renameWorkspaceRecord(
        activeWorkspaceId,
        renameWorkspaceName.trim(),
      )
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : '워크스페이스 이름을 바꾸지 못했습니다.')
    }
  }

  const deletePage = async (pageId: string) => {
    if (!accessToken || !canEdit) return
    try {
      await deletePageRecord(pageId, {
        workspaceId: activeWorkspaceId,
        onSelectionChange: replaceLoadedPageSelection,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '페이지를 삭제하지 못했습니다.')
    }
  }

  const inviteMember = async () => {
    if (!accessToken || !activeWorkspaceId || !inviteEmail.trim() || !canManageMembers || inviteLoading) return
    setError('')
    try {
      await inviteWorkspaceMember(
        activeWorkspaceId,
        inviteEmail.trim(),
        inviteRole,
      )
      setInviteEmail('')
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : '멤버를 추가하지 못했습니다.')
    }
  }

  const refreshWorkspaceData = async () => {
    if (!accessToken || refreshing) return
    setRefreshing(true)
    setError('')

    try {
      await flushPendingContentSaves()

      const refreshedWorkspaces = await loadWorkspaces()
      const nextWorkspaceId = activeWorkspaceId || refreshedWorkspaces?.[0]?.id || ''
      if (nextWorkspaceId) {
        await loadPages(nextWorkspaceId)
        if (settingsOpen) {
          await loadMembers(nextWorkspaceId)
        }
      }
      showSavingStatus('loaded')
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '새로고침에 실패했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  const movePage = useCallback(async (draggedId: string, targetId: string, position: PageDropPosition) => {
    if (!accessToken) return
    setError('')

    try {
      await movePageRecord(draggedId, targetId, position, expandPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : '페이지 위치를 저장하지 못했습니다.')
    }
  }, [accessToken, expandPage, movePageRecord])

  const downloadPageMarkdown = (page: PageRecord) => {
    const content = getEffectiveContent(page)
    const markdown = tiptapToMarkdown(page.title, content)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${page.title || 'untitled'}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (authLoading) {
    return <main className="flex min-h-screen items-center justify-center text-[#77736a]">로딩 중...</main>
  }

  if (!session) return <AuthPanel />

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#777773] text-black">
      <AppHeader
        email={session.user.email ?? ''}
        workspace={activeWorkspace}
        refreshing={refreshing}
        settingsOpen={settingsOpen}
        settingsContainerRef={settingsRef}
        members={members}
        membersLoading={membersLoading}
        canManageMembers={canManageMembers}
        inviteEmail={inviteEmail}
        inviteRole={inviteRole}
        inviteLoading={inviteLoading}
        onRefresh={refreshWorkspaceData}
        onToggleSettings={() => setSettingsOpen(open => !open)}
        onInviteEmailChange={setInviteEmail}
        onInviteRoleChange={setInviteRole}
        onInvite={inviteMember}
        onSignOut={() => {
          setSettingsOpen(false)
          supabase.auth.signOut()
        }}
      />

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <WorkspaceSidebar
          sidebarWidth={sidebarWidth}
          menuContainerRef={workspaceMenuRef}
          menuOpen={workspaceMenuOpen}
          activeWorkspace={activeWorkspace}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
          workspacesLoading={workspacesLoading}
          workspaceName={workspaceName}
          creatingWorkspace={creatingWorkspace}
          renameWorkspaceName={renameWorkspaceName}
          renamingWorkspace={renamingWorkspace}
          canManageMembers={canManageMembers}
          canEdit={Boolean(canEdit)}
          pages={pages}
          pagesLoading={pagesLoading}
          pageTree={pageTree}
          activePageId={activePageId}
          collapsedPageIds={collapsedPageIds}
          newPageTitle={newPageTitle}
          creatingPage={creatingPage}
          onToggleMenu={() => setWorkspaceMenuOpen(open => !open)}
          onWorkspaceNameChange={setWorkspaceName}
          onCreateWorkspace={createWorkspace}
          onSelectWorkspace={selectWorkspace}
          onReorderWorkspaces={reorderWorkspaces}
          onRenameWorkspaceNameChange={setRenameWorkspaceName}
          onRenameWorkspace={renameWorkspace}
          onSearch={() => setSearchOpen(true)}
          onNewPageTitleChange={setNewPageTitle}
          onCreatePage={createPage}
          onOpenPage={openPage}
          onTogglePageCollapse={togglePageCollapse}
          onRequestDeletePage={setDeleteTargetId}
          onDownloadMarkdown={downloadPageMarkdown}
          onMovePage={movePage}
          onResizeStart={startSidebarResize}
        />

        <DocumentPane
          error={error}
          loading={(workspacesLoading && workspaces.length === 0) || (pagesLoading && pages.length === 0)}
          page={activePage}
          content={activePageContent}
          breadcrumbPrefix={activePageBreadcrumbPrefix}
          canEdit={Boolean(canEdit)}
          savingStatus={saving}
          visibleSavingStatus={visibleSavingStatus}
          hasWorkspace={Boolean(activeWorkspaceId)}
          workspaceCount={workspaces.length}
          pageCount={pages.length}
          onTitleChange={(pageId, title) => {
            setPages(previous => previous.map(page => (
              page.id === pageId ? { ...page, title } : page
            )))
          }}
          onTitleFocus={rememberTitle}
          onTitleCommit={(pageId, title, currentTitle) => {
            const previousTitle = consumePreviousTitle(pageId, currentTitle)
            if (title.trim() === previousTitle.trim()) return
            updatePage(pageId, { title })
          }}
          onContentChange={scheduleContentSave}
          onUploadImage={canEdit ? uploadImage : undefined}
          onCloneImage={canEdit ? cloneImage : undefined}
        />
      </div>
      <DeletePageDialog
        page={deleteTarget}
        hasChildren={deleteTargetHasChildren}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={targetId => {
          setDeleteTargetId(null)
          deletePage(targetId).catch(err =>
            setError(err instanceof Error ? err.message : '페이지를 삭제하지 못했습니다.')
          )
        }}
      />
      {ENABLE_AGI && <FloatingAiButton />}
      <SearchModal
        open={searchOpen}
        pages={pages}
        onClose={() => setSearchOpen(false)}
        onSelect={revealPage}
      />
    </main>
  )
}
