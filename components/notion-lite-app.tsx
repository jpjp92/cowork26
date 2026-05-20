'use client'

import { Session } from '@supabase/supabase-js'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthPanel from './auth-panel'
import { supabase } from '../lib/supabase-browser'

const DocumentEditor = dynamic(() => import('./document-editor'), { ssr: false })
const DEBUG_SAVE_FLOW = process.env.NODE_ENV !== 'production'

function debugSaveFlow(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_SAVE_FLOW) return
  console.log(`[save-flow] ${message}`, data ?? {})
}

interface Workspace {
  id: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: string
}

interface PageRecord {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  order_index: number
  content: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface WorkspaceMember {
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: string
  email: string | null
}

async function readError(response: Response, fallback: string) {
  try {
    const data = await response.json()
    return new Error(data?.error ? `${fallback}: ${data.error}` : fallback)
  } catch {
    return new Error(fallback)
  }
}

export default function NotionLiteApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [pages, setPages] = useState<PageRecord[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('')
  const [activePageId, setActivePageId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [renameWorkspaceName, setRenameWorkspaceName] = useState('')
  const [newPageTitle, setNewPageTitle] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<'idle' | 'saved' | 'loaded'>('idle')
  const [visibleSavingStatus, setVisibleSavingStatus] = useState<'saved' | 'loaded'>('loaded')
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [renamingWorkspace, setRenamingWorkspace] = useState(false)
  const [creatingPage, setCreatingPage] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingPageId, setLoadingPageId] = useState('')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviteLoading, setInviteLoading] = useState(false)
  const saveTimers = useRef(new Map<string, number>())
  const pendingContent = useRef(new Map<string, Record<string, unknown>>())
  const contentSaveInFlight = useRef(new Set<string>())
  const settingsRef = useRef<HTMLDivElement>(null)
  const draggedIdRef = useRef<string | null>(null)
  const activePageIdRef = useRef(activePageId)
  const loadingPageIdRef = useRef('')
  const savingResetTimerRef = useRef<number | null>(null)
  const titleFocusValueRef = useRef(new Map<string, string>())
  const [dragOver, setDragOver] = useState<{ id: string; position: 'above' | 'below' } | null>(null)

  const accessToken = session?.access_token
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId)
  const activePage = pages.find(page => page.id === activePageId) ?? null
  const activePageContent = activePage ? pendingContent.current.get(activePage.id) ?? activePage.content : null
  const activePageLoading = Boolean(activePage && loadingPageId === activePage.id)
  const canEdit = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'editor'
  const canManageMembers = activeWorkspace?.role === 'owner'

  const activePageTrail = useMemo(() => {
    if (!activePage) return []

    const pagesById = new Map(pages.map(page => [page.id, page]))
    const trail: PageRecord[] = []
    const visited = new Set<string>()
    let currentPage: PageRecord | undefined = activePage

    while (currentPage && !visited.has(currentPage.id)) {
      visited.add(currentPage.id)
      trail.unshift(currentPage)
      currentPage = currentPage.parent_id ? pagesById.get(currentPage.parent_id) : undefined
    }

    return trail
  }, [activePage, pages])

  const activePageBreadcrumbPrefix = [
    activeWorkspace?.name,
    ...activePageTrail.slice(0, -1).map(page => page.title),
  ].filter(Boolean)

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }), [accessToken])

  useEffect(() => {
    activePageIdRef.current = activePageId
  }, [activePageId])

  const showSavingStatus = useCallback((status: 'saved' | 'loaded') => {
    if (savingResetTimerRef.current) {
      window.clearTimeout(savingResetTimerRef.current)
    }

    setSaving(status)
    setVisibleSavingStatus(status)
    savingResetTimerRef.current = window.setTimeout(() => {
      setSaving('idle')
      savingResetTimerRef.current = null
    }, 1200)
  }, [])

  const selectActivePage = useCallback((pageId: string) => {
    activePageIdRef.current = pageId
    loadingPageIdRef.current = pageId
    setLoadingPageId(pageId)
    if (savingResetTimerRef.current) {
      window.clearTimeout(savingResetTimerRef.current)
      savingResetTimerRef.current = null
    }
    setSaving('idle')
    setActivePageId(pageId)
  }, [])

  const resetClientState = useCallback(() => {
    setSession(null)
    setWorkspaces([])
    setPages([])
    setMembers([])
    setActiveWorkspaceId('')
    selectActivePage('')
    setSettingsOpen(false)
  }, [selectActivePage])

  const loadWorkspaces = useCallback(async () => {
    if (!accessToken) return
    setError('')
    const response = await fetch('/api/workspaces', { headers: authHeaders() })
    if (!response.ok) throw await readError(response, '워크스페이스를 불러오지 못했습니다.')

    const data = await response.json() as Workspace[]
    setWorkspaces(data)
    setActiveWorkspaceId(current => current || data[0]?.id || '')
    return data
  }, [accessToken, authHeaders])

  const loadPages = useCallback(async (workspaceId: string) => {
    if (!accessToken || !workspaceId) return
    setError('')
    const response = await fetch(`/api/pages?workspaceId=${workspaceId}`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw await readError(response, '페이지를 불러오지 못했습니다.')

    const data = await response.json() as PageRecord[]
    setPages(data)
    setActivePageId(current => {
      const nextPageId = data.some(page => page.id === current) ? current : data[0]?.id || ''
      activePageIdRef.current = nextPageId
      return nextPageId
    })
  }, [accessToken, authHeaders])

  const loadMembers = useCallback(async (workspaceId: string) => {
    if (!accessToken || !workspaceId) return
    setMembersLoading(true)
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        headers: authHeaders(),
      })
      if (!response.ok) throw await readError(response, '멤버를 불러오지 못했습니다.')

      const data = await response.json() as WorkspaceMember[]
      setMembers(data)
    } finally {
      setMembersLoading(false)
    }
  }, [accessToken, authHeaders])

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
    if (!activeWorkspaceId) {
      setPages([])
      selectActivePage('')
      return
    }
    loadPages(activeWorkspaceId).catch(err => setError(err instanceof Error ? err.message : '오류가 발생했습니다.'))
  }, [activeWorkspaceId, loadPages, selectActivePage])

  useEffect(() => {
    if (!activePageId || !accessToken) return
    loadingPageIdRef.current = activePageId
    setLoadingPageId(activePageId)
    const abortController = new AbortController()

    // 페이지 전환 시 최신 content 서버에서 fetch (다른 사용자 수정 반영)
    fetch(`/api/pages?id=${activePageId}`, {
      headers: authHeaders(),
      signal: abortController.signal,
    })
      .then(res => res.ok ? res.json() : null)
      .then((fresh: PageRecord | null) => {
        if (!fresh) return
        if (fresh.id !== activePageIdRef.current) return

        debugSaveFlow('page loaded', {
          pageId: fresh.id,
          title: fresh.title,
          updatedAt: fresh.updated_at,
          hasSaveTimer: saveTimers.current.has(fresh.id),
          hasSaveInFlight: contentSaveInFlight.current.has(fresh.id),
          hasPendingContent: pendingContent.current.has(fresh.id),
        })
        showSavingStatus('loaded')

        const hasUnsavedLocalContent = (
          saveTimers.current.has(fresh.id) || contentSaveInFlight.current.has(fresh.id)
        )

        // 미저장 로컬 편집이 없는 경우에만 서버 최신본으로 덮어씀
        if (!hasUnsavedLocalContent) {
          pendingContent.current.delete(fresh.id)
          setPages(prev => prev.map(p => p.id === fresh.id ? fresh : p))
        }
      })
      .catch(() => { /* 조용히 무시 */ })
      .finally(() => {
        if (activePageIdRef.current === activePageId) {
          loadingPageIdRef.current = ''
          setLoadingPageId('')
        }
      })

    return () => abortController.abort()
  }, [activePageId, accessToken, authHeaders, showSavingStatus])

  useEffect(() => {
    setRenameWorkspaceName(activeWorkspace?.name ?? '')
  }, [activeWorkspace?.id, activeWorkspace?.name])

  useEffect(() => {
    if (!settingsOpen || !activeWorkspaceId) return
    loadMembers(activeWorkspaceId).catch(err => setError(err instanceof Error ? err.message : '오류가 발생했습니다.'))
  }, [settingsOpen, activeWorkspaceId, loadMembers])

  useEffect(() => {
    if (!settingsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!settingsRef.current?.contains(event.target)) {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [settingsOpen])

  useEffect(() => () => {
    for (const timer of saveTimers.current.values()) {
      window.clearTimeout(timer)
    }
    saveTimers.current.clear()
    if (savingResetTimerRef.current) {
      window.clearTimeout(savingResetTimerRef.current)
    }
  }, [])

  const pageTree = useMemo(() => {
    const byParent = new Map<string, PageRecord[]>()
    for (const page of pages) {
      const key = page.parent_id ?? 'root'
      byParent.set(key, [...(byParent.get(key) ?? []), page])
    }

    for (const list of byParent.values()) {
      list.sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
    }

    return byParent
  }, [pages])

  const createWorkspace = async () => {
    if (!workspaceName.trim() || !accessToken || creatingWorkspace) return
    setError('')
    setCreatingWorkspace(true)
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: workspaceName.trim() }),
      })
      if (!response.ok) {
        setError((await readError(response, '워크스페이스를 만들지 못했습니다.')).message)
        return
      }

      const data = await response.json() as { workspace: Workspace; page?: PageRecord }
      setWorkspaces(previous => [...previous, data.workspace])
      setActiveWorkspaceId(data.workspace.id)
      setWorkspaceName('')
      if (data.page) {
        setPages([data.page])
        selectActivePage(data.page.id)
      }
    } finally {
      setCreatingWorkspace(false)
    }
  }

  const createPage = async (parentId: string | null = null) => {
    if (!activeWorkspaceId || !accessToken || !canEdit || creatingPage) return
    setError('')
    setCreatingPage(true)
    try {
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          parentId,
          title: newPageTitle.trim() || 'Untitled',
        }),
      })
      if (!response.ok) {
        setError((await readError(response, '페이지를 만들지 못했습니다.')).message)
        return
      }

      const page = await response.json() as PageRecord
      setPages(previous => [...previous, page])
      selectActivePage(page.id)
      setNewPageTitle('')
    } finally {
      setCreatingPage(false)
    }
  }

  const renameWorkspace = async () => {
    if (!activeWorkspaceId || !renameWorkspaceName.trim() || !canManageMembers || renamingWorkspace) return
    setError('')
    setRenamingWorkspace(true)
    try {
      const response = await fetch('/api/workspaces', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          id: activeWorkspaceId,
          name: renameWorkspaceName.trim(),
        }),
      })

      if (!response.ok) {
        setError((await readError(response, '워크스페이스 이름을 바꾸지 못했습니다.')).message)
        return
      }

      const workspace = await response.json() as Workspace
      setWorkspaces(previous => previous.map(item => item.id === workspace.id ? workspace : item))
    } finally {
      setRenamingWorkspace(false)
    }
  }

  const updatePage = async (
    pageId: string,
    patch: Partial<Pick<PageRecord, 'title' | 'content'>>,
  ) => {
    if (!accessToken || !canEdit) return
    const isContentSave = patch.content !== undefined
    const isTitleSave = patch.title !== undefined
    debugSaveFlow('patch start', {
      pageId,
      activePageId: activePageIdRef.current,
      isContentSave,
      isTitleSave,
      loadingPageId: loadingPageIdRef.current,
      contentBlocks: Array.isArray(patch.content?.content) ? patch.content.content.length : null,
    })
    if (isContentSave) contentSaveInFlight.current.add(pageId)

    try {
      const response = await fetch('/api/pages', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: pageId, ...patch }),
      })

      if (!response.ok) {
        setError((await readError(response, '페이지를 저장하지 못했습니다.')).message)
        return
      }

      const page = await response.json() as PageRecord
      debugSaveFlow('patch success', {
        pageId: page.id,
        activePageId: activePageIdRef.current,
        isContentSave,
        isTitleSave,
        updatedAt: page.updated_at,
        willShowSaved: pageId === activePageIdRef.current,
      })
      const currentPendingContent = pendingContent.current.get(page.id)
      const savedContent = page.content ?? null
      if (
        currentPendingContent &&
        JSON.stringify(currentPendingContent) === JSON.stringify(savedContent)
      ) {
        pendingContent.current.delete(page.id)
      }

      setPages(previous => previous.map(item => (
        item.id === page.id
          ? { ...page, content: pendingContent.current.get(page.id) ?? page.content }
          : item
      )))
      // 현재 보고 있는 페이지가 저장된 페이지일 때만 배지 표시
      // (이전 페이지 지연 저장이 페이지 전환 후 완료되어도 배지가 뜨지 않도록)
      if (pageId === activePageIdRef.current) {
        showSavingStatus('saved')
      }
    } finally {
      if (isContentSave) contentSaveInFlight.current.delete(pageId)
    }
  }

  const scheduleContentSave = (pageId: string, content: Record<string, unknown>) => {
    if (!canEdit) return
    if (loadingPageIdRef.current === pageId) {
      debugSaveFlow('schedule ignored while loading', {
        pageId,
        loadingPageId: loadingPageIdRef.current,
      })
      return
    }
    debugSaveFlow('schedule content save', {
      pageId,
      activePageId: activePageIdRef.current,
      contentBlocks: Array.isArray(content.content) ? content.content.length : null,
    })
    pendingContent.current.set(pageId, content)

    const existingTimer = saveTimers.current.get(pageId)
    if (existingTimer) window.clearTimeout(existingTimer)

    const nextTimer = window.setTimeout(() => {
      saveTimers.current.delete(pageId)
      updatePage(pageId, { content }).catch(err => {
        setSaving('idle')
        setError(err instanceof Error ? err.message : '페이지를 저장하지 못했습니다.')
      })
    }, 1500)
    saveTimers.current.set(pageId, nextTimer)
  }

  const flushPendingContentSaves = async () => {
    const pendingEntries = Array.from(pendingContent.current.entries())
    if (pendingEntries.length === 0) return

    for (const pageId of pendingContent.current.keys()) {
      const saveTimer = saveTimers.current.get(pageId)
      if (saveTimer) {
        window.clearTimeout(saveTimer)
        saveTimers.current.delete(pageId)
      }
    }

    await Promise.all(pendingEntries.map(([pageId, content]) => (
      updatePage(pageId, { content })
    )))
  }

  const deletePage = async (pageId: string) => {
    if (!accessToken || !canEdit) return
    if (!window.confirm('이 페이지와 하위 페이지를 삭제할까요?')) return

    const response = await fetch(`/api/pages?id=${pageId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!response.ok) {
      setError((await readError(response, '페이지를 삭제하지 못했습니다.')).message)
      return
    }

    const deletedIds = new Set([pageId])
    let changed = true
    while (changed) {
      changed = false
      for (const page of pages) {
        if (page.parent_id && deletedIds.has(page.parent_id) && !deletedIds.has(page.id)) {
          deletedIds.add(page.id)
          changed = true
        }
      }
    }

    for (const deletedId of deletedIds) {
      pendingContent.current.delete(deletedId)
      const saveTimer = saveTimers.current.get(deletedId)
      if (saveTimer) {
        window.clearTimeout(saveTimer)
        saveTimers.current.delete(deletedId)
      }
    }

    const remaining = pages.filter(page => !deletedIds.has(page.id))
    setPages(remaining)
    setActivePageId(current => {
      const nextPageId = deletedIds.has(current) ? remaining[0]?.id ?? '' : current
      activePageIdRef.current = nextPageId
      return nextPageId
    })
  }

  const inviteMember = async () => {
    if (!activeWorkspaceId || !inviteEmail.trim() || !canManageMembers || inviteLoading) return
    setInviteLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/members`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      })
      if (!response.ok) {
        setError((await readError(response, '멤버를 추가하지 못했습니다.')).message)
        return
      }

      setInviteEmail('')
      await loadMembers(activeWorkspaceId)
    } finally {
      setInviteLoading(false)
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

  const reorderPage = useCallback(async (draggedId: string, targetId: string, position: 'above' | 'below') => {
    if (draggedId === targetId || !accessToken) return
    const draggedPage = pages.find(p => p.id === draggedId)
    const targetPage = pages.find(p => p.id === targetId)
    if (!draggedPage || !targetPage) return
    if (draggedPage.parent_id !== targetPage.parent_id) return

    const siblings = [...(pageTree.get(targetPage.parent_id ?? 'root') ?? [])]
    const withoutDragged = siblings.filter(p => p.id !== draggedId)
    const targetIdx = withoutDragged.findIndex(p => p.id === targetId)
    const insertIdx = position === 'above' ? targetIdx : targetIdx + 1
    withoutDragged.splice(insertIdx, 0, draggedPage)

    const reordered = withoutDragged.map((p, i) => ({ ...p, order_index: i }))

    // optimistic update
    setPages(prev => prev.map(p => reordered.find(r => r.id === p.id) ?? p))

    // persist only changed order_index values
    const changed = reordered.filter(r => {
      const original = siblings.find(s => s.id === r.id)
      return original?.order_index !== r.order_index
    })
    await Promise.all(changed.map(p =>
      fetch('/api/pages', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: p.id, orderIndex: p.order_index }),
      })
    ))
  }, [accessToken, authHeaders, pages, pageTree])

  const renderPageList = (parentId: string | null, depth = 0): React.ReactNode => {
    const items = pageTree.get(parentId ?? 'root') ?? []
    return items.map(page => (
      <div key={page.id}>
        {/* drop indicator — above */}
        {dragOver?.id === page.id && dragOver.position === 'above' && (
          <div className="mx-1 h-0.5 rounded bg-[#baf7c8]" style={{ marginLeft: depth * 14 + 4 }} />
        )}
        <div
          className="group/page-row flex items-center gap-2"
          style={{ paddingLeft: depth * 14 }}
          draggable={canEdit}
          onDragStart={() => { draggedIdRef.current = page.id }}
          onDragEnd={() => { draggedIdRef.current = null; setDragOver(null) }}
          onDragOver={e => {
            e.preventDefault()
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const position = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
            setDragOver(prev =>
              prev?.id === page.id && prev.position === position ? prev : { id: page.id, position }
            )
          }}
          onDragLeave={e => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
              setDragOver(null)
            }
          }}
          onDrop={e => {
            e.preventDefault()
            const dragged = draggedIdRef.current
            if (dragged) reorderPage(dragged, page.id, dragOver?.position ?? 'below')
            draggedIdRef.current = null
            setDragOver(null)
          }}
        >
          <button
            onClick={() => selectActivePage(page.id)}
            className={`flex h-9 min-w-0 flex-1 items-center truncate rounded-[8px] px-3 text-left text-sm ${
              page.id === activePageId
                ? 'border border-black bg-[#baf7c8] font-black text-black shadow-[2px_2px_0_#000]'
                : 'font-semibold text-white hover:bg-[#50504d]'
            }`}
          >
            {page.title}
          </button>
          {canEdit && (
            <div className="ml-2 flex shrink-0 gap-2 opacity-0 transition-opacity group-hover/page-row:opacity-100 group-focus-within/page-row:opacity-100">
              <button
                onClick={() => createPage(page.id)}
                className="h-9 w-9 shrink-0 rounded-[8px] border border-black bg-white text-sm font-black leading-none text-black shadow-[2px_2px_0_#000] hover:bg-[#baf7c8]"
                title="하위 페이지 추가"
              >
                +
              </button>
              <button
                onClick={() => deletePage(page.id)}
                className="h-9 w-9 shrink-0 rounded-[8px] border border-black bg-red-300 text-sm font-black leading-none text-black shadow-[2px_2px_0_#000] hover:bg-red-200"
                title="페이지 삭제"
              >
                x
              </button>
            </div>
          )}
        </div>
        {/* drop indicator — below */}
        {dragOver?.id === page.id && dragOver.position === 'below' && (
          <div className="mx-1 h-0.5 rounded bg-[#baf7c8]" style={{ marginLeft: depth * 14 + 4 }} />
        )}
        {renderPageList(page.id, depth + 1)}
      </div>
    ))
  }

  if (authLoading) {
    return <main className="flex min-h-screen items-center justify-center text-[#77736a]">로딩 중...</main>
  }

  if (!session) return <AuthPanel />

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#777773] text-black">
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-black bg-[#777773] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-black bg-[#baf7c8] text-sm font-black leading-none text-black shadow-[2px_2px_0_#000]">
            C
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-normal text-white">Cowork26</p>
            <p className="truncate text-xs font-bold text-neutral-100">{session.user.email}</p>
          </div>
        </div>

        <div className="relative flex min-w-0 items-center gap-2" ref={settingsRef}>
          <button
            onClick={refreshWorkspaceData}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000] disabled:opacity-40"
            title="새로고침"
          >
            {refreshing
              ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span>
              : '↻'}
          </button>
          <button
            onClick={() => setSettingsOpen(open => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000]"
            title="설정"
          >
            ⚙
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-11 z-20 w-80 rounded-[8px] border border-black bg-[#50504d] p-3 text-white shadow-[5px_5px_0_#000]">
              <p className="truncate text-xs font-bold text-neutral-100">{session.user.email}</p>
              {activeWorkspace && (
                <p className="mt-1 truncate text-sm font-black uppercase">{activeWorkspace.name}</p>
              )}
              {activeWorkspace && (
                <>
                  <div className="mt-3 border-t border-black pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-black uppercase text-neutral-100">Members</p>
                      {membersLoading ? (
                        <span className="text-[11px] font-bold text-neutral-200">불러오는 중</span>
                      ) : (
                        <span className="border border-black bg-[#baf7c8] px-1.5 text-[11px] font-black text-black">
                          {members.length}
                        </span>
                      )}
                    </div>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {members.map(member => (
                        <div key={member.user_id} className="rounded-[8px] border border-black bg-[#62625f] px-2 py-2">
                          <p className="truncate text-xs font-bold text-white">
                            {member.email ?? member.user_id}
                          </p>
                          <p className="mt-1 text-[11px] font-black uppercase text-[#baf7c8]">
                            {member.role}
                          </p>
                        </div>
                      ))}
                      {!membersLoading && members.length === 0 && (
                        <p className="text-xs font-bold text-neutral-200">멤버가 없습니다.</p>
                      )}
                    </div>
                  </div>
                  {canManageMembers && (
                    <div className="mt-3 border-t border-black pt-3">
                      <p className="mb-2 text-[11px] font-black uppercase text-neutral-100">Add Member</p>
                      <input
                        className="w-full rounded-[8px] border border-black bg-white px-2.5 py-2 text-sm font-bold text-black outline-none placeholder:text-[#666]"
                        placeholder="이메일"
                        type="email"
                        value={inviteEmail}
                        onChange={event => setInviteEmail(event.target.value)}
                        onKeyDown={event => event.key === 'Enter' && inviteMember()}
                      />
                      <div className="mt-2 flex gap-2">
                        <select
                          className="h-9 min-w-0 flex-1 rounded-[8px] border border-black bg-[#62625f] px-2 text-xs font-black uppercase text-white outline-none"
                          value={inviteRole}
                          onChange={event => setInviteRole(event.target.value as 'editor' | 'viewer')}
                        >
                          <option value="editor">editor</option>
                          <option value="viewer">viewer</option>
                        </select>
                        <button
                          onClick={inviteMember}
                          disabled={!inviteEmail.trim() || inviteLoading}
                          className="h-9 rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] disabled:opacity-40"
                        >
                          {inviteLoading ? '추가 중' : '멤버 추가'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <button
                onClick={() => {
                  setSettingsOpen(false)
                  supabase.auth.signOut()
                }}
                className="mt-3 h-9 w-full rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000]"
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <aside className="flex w-[312px] shrink-0 flex-col border-r border-black bg-[#62625f] max-lg:w-64 max-md:w-full max-md:border-r-0 max-md:border-b">
        <div className="border-b border-black p-3">
          <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-normal text-white">
            Workspace
          </p>
          <select
            className="mb-2 w-full rounded-[8px] border border-black bg-[#50504d] px-2.5 py-2 text-sm font-black text-white outline-none focus:-translate-y-0.5 focus:bg-white focus:text-black focus:shadow-[3px_3px_0_#000]"
            value={activeWorkspaceId}
            onChange={event => setActiveWorkspaceId(event.target.value)}
          >
            <option value="">워크스페이스 선택</option>
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
          {canManageMembers && activeWorkspace && (
            <div className="mb-2 flex gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-[8px] border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
                placeholder="워크스페이스 이름"
                value={renameWorkspaceName}
                onChange={event => setRenameWorkspaceName(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && renameWorkspace()}
              />
              <button
                onClick={renameWorkspace}
                disabled={!renameWorkspaceName.trim() || renamingWorkspace}
                className="h-9 w-9 shrink-0 rounded-[8px] border border-black bg-white text-sm font-black leading-none text-black shadow-[2px_2px_0_#000] hover:bg-[#baf7c8] disabled:opacity-40"
                title="워크스페이스 이름 저장"
              >
                {renamingWorkspace ? '…' : '✓'}
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
              placeholder="새 워크스페이스"
              value={workspaceName}
              onChange={event => setWorkspaceName(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && createWorkspace()}
            />
            <button
              onClick={createWorkspace}
              disabled={!workspaceName.trim() || creatingWorkspace}
              className="h-9 w-9 shrink-0 rounded-[8px] border border-black bg-[#baf7c8] text-sm font-black leading-none text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000] disabled:opacity-40"
            >
              {creatingWorkspace ? '…' : '+'}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[11px] font-black uppercase tracking-normal text-white">
              Pages
            </p>
            <span className="border border-black bg-[#baf7c8] px-1.5 text-xs font-black text-black">{pages.length}</span>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
              placeholder="새 페이지"
              value={newPageTitle}
              onChange={event => setNewPageTitle(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && createPage()}
              disabled={!activeWorkspaceId || !canEdit}
            />
            <button
              onClick={() => createPage()}
              disabled={!activeWorkspaceId || !canEdit || creatingPage}
              className="h-9 w-9 shrink-0 rounded-[8px] border border-black bg-[#50504d] text-sm font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000] disabled:opacity-40"
            >
              {creatingPage ? '...' : '+'}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 max-md:max-h-56">
            {activeWorkspaceId ? (
              pages.length > 0 ? renderPageList(null) : (
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
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto max-md:min-h-[60vh]">

        {error && (
          <div className="border-b border-black bg-red-300 px-6 py-3 text-sm font-bold text-black max-sm:px-4">
            <span className="font-black">처리 실패</span>
            <span className="ml-2">{error}</span>
          </div>
        )}

        {activePage ? (
          <article className="mx-auto my-8 w-full max-w-4xl flex-1 rounded-[8px] border border-black bg-[#fef9ef] px-10 py-12 text-[#1d1c16] shadow-[6px_6px_0_#000] max-sm:mx-4 max-sm:px-5 max-sm:py-8">
            <div className="mb-4 border-b border-black pb-3">
              <div className="flex min-w-0 items-center gap-3 text-[#1d1c16]">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  {activePageBreadcrumbPrefix.map((label, index) => (
                    <span key={`${label}-${index}`} className="flex min-w-0 items-baseline gap-x-2 text-sm font-black text-[#6c685f]">
                      <span className="max-w-48 truncate">{label}</span>
                      <span>/</span>
                    </span>
                  ))}
                  <input
                    className="min-w-[12rem] flex-1 bg-transparent text-2xl font-black leading-tight tracking-normal text-[#1d1c16] outline-none placeholder:text-[#8a867f] max-sm:text-xl"
                    value={activePage.title}
                    disabled={!canEdit || activePageLoading}
                    placeholder="Untitled"
                    onChange={event => {
                      const title = event.target.value
                      setPages(previous => previous.map(page => (
                        page.id === activePage.id ? { ...page, title } : page
                      )))
                    }}
                    onFocus={event => {
                      titleFocusValueRef.current.set(activePage.id, event.target.value)
                    }}
                    onBlur={event => {
                      const previousTitle = titleFocusValueRef.current.get(activePage.id) ?? activePage.title
                      titleFocusValueRef.current.delete(activePage.id)
                      if (event.target.value.trim() === previousTitle.trim()) return

                      updatePage(activePage.id, { title: event.target.value })
                    }}
                  />
                </div>
                <span
                  className={`w-16 shrink-0 rounded-[8px] border border-black px-2 py-1 text-center text-[11px] font-black text-black shadow-[2px_2px_0_#000] transition-opacity ${
                    saving === 'idle' ? 'pointer-events-none opacity-0' : 'opacity-100'
                  } ${
                    visibleSavingStatus === 'loaded' ? 'bg-[#fde68a]' : 'bg-[#baf7c8]'
                  }`}
                >
                  {visibleSavingStatus === 'loaded' ? '불러옴' : '저장됨'}
                </span>
              </div>
            </div>
            <DocumentEditor
              key={activePage.id}
              content={activePageContent}
              editable={Boolean(canEdit && !activePageLoading)}
              onChange={content => scheduleContentSave(activePage.id, content)}
            />
          </article>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
            <div className="grid w-full max-w-4xl grid-cols-[1.3fr_0.7fr] gap-4 max-lg:grid-cols-1">
              <div className="rounded-[8px] border border-black bg-[#50504d] p-8 text-left shadow-[6px_6px_0_#000]">
                <p className="text-3xl font-black uppercase text-white">
                  {activeWorkspaceId ? '페이지를 선택하거나 새로 만드세요.' : '워크스페이스를 먼저 만드세요.'}
                </p>
              </div>
              <div className="grid gap-4">
                <div className="rounded-[8px] border border-black bg-[#50504d] p-5 text-left shadow-[4px_4px_0_#000]">
                  <p className="text-xs font-black uppercase text-[#baf7c8]">Workspaces</p>
                  <p className="mt-2 text-4xl font-black text-white">{workspaces.length}</p>
                </div>
                <div className="rounded-[8px] border border-black bg-[#50504d] p-5 text-left shadow-[4px_4px_0_#000]">
                  <p className="text-xs font-black uppercase text-[#baf7c8]">Pages</p>
                  <p className="mt-2 text-4xl font-black text-white">{pages.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        </section>
      </div>
    </main>
  )
}
