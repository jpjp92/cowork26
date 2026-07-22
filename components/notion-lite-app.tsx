'use client'

import { Session } from '@supabase/supabase-js'
import dynamic from 'next/dynamic'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthPanel from './auth-panel'
import FloatingAiButton from './floating-ai-button'
import { supabase } from '../lib/supabase-browser'
import { getSelectionPath, readSelectionFromPath } from '../lib/selection-route'
import { tiptapToMarkdown } from '../lib/tiptap-to-markdown'
import { SearchModal } from './search-modal'

const DocumentEditor = dynamic(() => import('./document-editor'), { ssr: false })
const DEBUG_SAVE_FLOW = process.env.NODE_ENV !== 'production'
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

function debugSaveFlow(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_SAVE_FLOW) return
  console.log(`[save-flow] ${message}`, data ?? {})
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

interface Workspace {
  id: string
  name: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: string
  order_index?: number
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

interface UploadedImageAsset {
  id: string
  url: string
  storagePath?: string
  alt?: string
}

type PageDropPosition = 'above' | 'below' | 'inside'

interface NotionLiteAppProps {
  initialWorkspaceId?: string
  initialPageId?: string
}

function updateSelectionUrl(workspaceId: string, pageId: string | undefined, history: 'push' | 'replace') {
  const path = workspaceId ? getSelectionPath(workspaceId, pageId) : '/'
  if (window.location.pathname === path) return

  const state = { ...window.history.state, coworkSelection: true }
  if (history === 'push') window.history.pushState(state, '', path)
  else window.history.replaceState(state, '', path)
}

async function readError(response: Response, fallback: string) {
  try {
    const data = await response.json()
    return new Error(data?.error ? `${fallback}: ${data.error}` : fallback)
  } catch {
    return new Error(fallback)
  }
}

function getWorkspaceRoleSymbol(role?: Workspace['role']) {
  if (role === 'owner') return '●'
  if (role === 'editor') return '◆'
  if (role === 'viewer') return '○'
  return '–'
}

function getRoleBadgeClass(role: string) {
  if (role === 'owner') return 'bg-[#baf7c8] text-black'
  if (role === 'editor') return 'bg-[#fde68a] text-black'
  return 'bg-[#c4b5fd] text-black'
}

function PageTreeSkeleton() {
  return (
    <div className="grid gap-2">
      {[0, 1, 2, 3, 4].map(index => (
        <div
          key={index}
          className="h-8 animate-pulse rounded-[4px] border border-black bg-[#50504d]"
          style={{ marginLeft: index > 1 ? 20 : 0, width: `${92 - index * 7}%` }}
        />
      ))}
    </div>
  )
}

function DocumentSkeleton() {
  return (
    <article className="mx-auto my-8 w-full max-w-4xl flex-1 rounded-[8px] border border-black bg-[#fef9ef] px-10 py-12 shadow-[6px_6px_0_#000] max-sm:mx-4 max-sm:px-5 max-sm:py-8">
      <div className="mb-4 border-b border-black pb-3">
        <div className="h-8 w-2/3 animate-pulse rounded-[4px] bg-[#d8d0c0]" />
      </div>
      <div className="space-y-4">
        <div className="h-5 w-full animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="h-5 w-11/12 animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="h-5 w-4/5 animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="mt-8 h-40 w-full animate-pulse rounded-[8px] border border-black bg-[#ece4d5]" />
        <div className="h-5 w-5/6 animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="h-5 w-2/3 animate-pulse rounded-[4px] bg-[#ded7c9]" />
      </div>
    </article>
  )
}

function MembersSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map(index => (
        <div key={index} className="rounded-[8px] border border-black bg-[#62625f] px-2 py-2">
          <div className="h-3 w-4/5 animate-pulse rounded bg-[#777773]" />
          <div className="mt-2 h-4 w-16 animate-pulse rounded bg-[#baf7c8]/60" />
        </div>
      ))}
    </div>
  )
}

export default function NotionLiteApp({ initialWorkspaceId = '', initialPageId = '' }: NotionLiteAppProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [pagesLoading, setPagesLoading] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [pages, setPages] = useState<PageRecord[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaceId)
  const [activePageId, setActivePageId] = useState(initialPageId)
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviteLoading, setInviteLoading] = useState(false)
  const saveTimers = useRef(new Map<string, number>())
  const pendingContent = useRef(new Map<string, Record<string, unknown>>())
  const contentSaveInFlight = useRef(new Set<string>())
  const settingsRef = useRef<HTMLDivElement>(null)
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const workspaceDraggedIdRef = useRef<string | null>(null)
  const workspaceDragClickBlockedRef = useRef(false)
  const draggedIdRef = useRef<string | null>(null)
  const activePageIdRef = useRef(activePageId)
  const activeWorkspaceIdRef = useRef(activeWorkspaceId)
  const workspacesRef = useRef<Workspace[]>([])
  const pagesRef = useRef<PageRecord[]>([])
  const pagesCache = useRef(new Map<string, PageRecord[]>())
  const routeResolutionSequenceRef = useRef(0)
  const standalonePageIdRef = useRef(initialPageId && !initialWorkspaceId ? initialPageId : '')
  const pendingCreateIds = useRef(new Set<string>())
  const pageFetchedAtRef = useRef(new Map<string, number>())
  const savingResetTimerRef = useRef<number | null>(null)
  const titleFocusValueRef = useRef(new Map<string, string>())
  const [dragOver, setDragOver] = useState<{ id: string; position: PageDropPosition } | null>(null)
  const [workspaceDragOver, setWorkspaceDragOver] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set())
  // 현재 collapsedPages가 대표하는 워크스페이스 id. 워크스페이스가 바뀌면 해당 워크스페이스의
  // 접힘 상태를 다시 로드하기 위한 추적 ref(전환 시 재동기화 판단 + 저장 오염 방지).
  const collapsedWorkspaceRef = useRef<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const accessToken = session?.access_token
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId)
  const activePage = pages.find(page => page.id === activePageId) ?? null
  const activePageContent = activePage ? pendingContent.current.get(activePage.id) ?? activePage.content : null
  const canEdit = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'editor'
  const canManageMembers = activeWorkspace?.role === 'owner'
  const deleteTarget = deleteTargetId ? pages.find(page => page.id === deleteTargetId) ?? null : null
  const deleteTargetHasChildren = deleteTargetId
    ? pages.some(page => page.parent_id === deleteTargetId)
    : false

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

  const authUploadHeaders = useCallback(() => ({
    Authorization: `Bearer ${accessToken}`,
  }), [accessToken])

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    if (!Number.isFinite(savedWidth)) return
    setSidebarWidth(clampNumber(savedWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH))
  }, [])

  useEffect(() => {
    activePageIdRef.current = activePageId
  }, [activePageId])

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId
  }, [activeWorkspaceId])

  useEffect(() => {
    workspacesRef.current = workspaces
  }, [workspaces])

  // 삭제 확인 모달: Esc로 닫기
  useEffect(() => {
    if (!deleteTargetId) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteTargetId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteTargetId])

  // pages 변경을 워크스페이스별 캐시에 동기화한다.
  // 모든 setPages(생성/삭제/이동/이름변경/저장)가 여기서 자동 반영되어 mutation 호출부 수정 불필요.
  useEffect(() => {
    pagesRef.current = pages
    if (!activeWorkspaceId) return
    // workspace_id 가드: 전환 직후 이전 워크스페이스 pages가 새 id로 저장되는 레이스 차단.
    // 빈 배열은 여기서 캐싱하지 않음(loadPages가 책임) → '미로드' vs '로드 후 빈' 혼동 방지.
    if (pages.length > 0 && pages[0].workspace_id === activeWorkspaceId) {
      pagesCache.current.set(activeWorkspaceId, pages)
    }
  }, [pages, activeWorkspaceId])

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

  const toggleCollapse = useCallback((pageId: string) => {
    setCollapsedPages(prev => {
      const next = new Set(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }, [])

  const selectActivePage = useCallback((pageId: string) => {
    activePageIdRef.current = pageId
    if (savingResetTimerRef.current) {
      window.clearTimeout(savingResetTimerRef.current)
      savingResetTimerRef.current = null
    }
    setSaving('idle')
    setActivePageId(pageId)
  }, [])

  const openPage = useCallback((pageId: string, history: 'push' | 'replace' = 'push') => {
    const workspaceId = activeWorkspaceIdRef.current
    selectActivePage(pageId)
    if (!workspaceId || !pageId) return
    updateSelectionUrl(workspaceId, pageId, history)
  }, [selectActivePage])

  // 브라우저 뒤로/앞으로 이동 또는 공유 URL 직접 접속 시 선택 상태를 경로에 맞춘다.
  useEffect(() => {
    if (!initialWorkspaceId) return

    if (initialWorkspaceId !== activeWorkspaceIdRef.current) {
      activeWorkspaceIdRef.current = initialWorkspaceId
      setActiveWorkspaceId(initialWorkspaceId)
      selectActivePage(initialPageId)
      return
    }

    if (initialPageId && initialPageId !== activePageIdRef.current) {
      selectActivePage(initialPageId)
    }
  }, [initialWorkspaceId, initialPageId, selectActivePage])

  const activateResolvedPage = useCallback((page: PageRecord, availableWorkspaces = workspacesRef.current) => {
    if (!availableWorkspaces.some(workspace => workspace.id === page.workspace_id)) return false

    const cached = pagesCache.current.get(page.workspace_id) ?? []
    const nextPages = cached.some(item => item.id === page.id)
      ? cached.map(item => item.id === page.id ? page : item)
      : [...cached, page]

    pagesCache.current.set(page.workspace_id, nextPages)
    pagesRef.current = nextPages
    pageFetchedAtRef.current.set(page.id, Date.now())
    activeWorkspaceIdRef.current = page.workspace_id
    setActiveWorkspaceId(page.workspace_id)
    setPages(nextPages)
    selectActivePage(page.id)
    updateSelectionUrl(page.workspace_id, page.id, 'replace')
    return true
  }, [selectActivePage])

  const fallbackFromInvalidPageRoute = useCallback(() => {
    const fallbackWorkspaceId = workspacesRef.current[0]?.id ?? ''
    activeWorkspaceIdRef.current = fallbackWorkspaceId
    setActiveWorkspaceId(fallbackWorkspaceId)
    selectActivePage('')
    updateSelectionUrl(fallbackWorkspaceId, undefined, 'replace')
  }, [selectActivePage])

  const resolvePageRoute = useCallback(async (pageId: string) => {
    if (!pageId) return
    const sequence = ++routeResolutionSequenceRef.current

    const currentPage = pagesRef.current.find(page => page.id === pageId)
    if (currentPage) {
      if (sequence === routeResolutionSequenceRef.current) activateResolvedPage(currentPage)
      return
    }

    for (const workspacePages of pagesCache.current.values()) {
      const cachedPage = workspacePages.find(page => page.id === pageId)
      if (cachedPage) {
        if (sequence === routeResolutionSequenceRef.current) activateResolvedPage(cachedPage)
        return
      }
    }

    if (!accessToken) return

    try {
      const response = await fetch(`/api/pages?id=${encodeURIComponent(pageId)}`, {
        headers: authHeaders(),
      })
      if (sequence !== routeResolutionSequenceRef.current) return

      const currentRoute = readSelectionFromPath(window.location.pathname)
      if (currentRoute.pageId !== pageId) return

      if (!response.ok) {
        fallbackFromInvalidPageRoute()
        return
      }

      const page = await response.json() as PageRecord
      if (sequence !== routeResolutionSequenceRef.current) return
      if (!activateResolvedPage(page)) fallbackFromInvalidPageRoute()
    } catch {
      if (sequence === routeResolutionSequenceRef.current) fallbackFromInvalidPageRoute()
    }
  }, [accessToken, activateResolvedPage, authHeaders, fallbackFromInvalidPageRoute])

  useEffect(() => {
    const handlePopState = () => {
      const selection = readSelectionFromPath(window.location.pathname)
      if (selection.kind === 'page' || selection.kind === 'legacy-page') {
        resolvePageRoute(selection.pageId)
        return
      }
      if (selection.kind !== 'workspace') return

      routeResolutionSequenceRef.current += 1
      if (selection.workspaceId !== activeWorkspaceIdRef.current) {
        activeWorkspaceIdRef.current = selection.workspaceId
        setActiveWorkspaceId(selection.workspaceId)
      }
      selectActivePage('')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [resolvePageRoute, selectActivePage])

  // 검색 등으로 페이지를 열 때, 접힌 조상들을 펼쳐 사이드바에서 해당 페이지가 보이게 한다.
  const revealPage = useCallback((pageId: string) => {
    const pagesById = new Map(pagesRef.current.map(page => [page.id, page]))
    const ancestors: string[] = []
    const visited = new Set<string>()
    let current = pagesById.get(pageId)?.parent_id ?? null
    while (current && !visited.has(current)) {
      visited.add(current)
      ancestors.push(current)
      current = pagesById.get(current)?.parent_id ?? null
    }
    if (ancestors.length > 0) {
      setCollapsedPages(prev => {
        if (!ancestors.some(id => prev.has(id))) return prev
        const next = new Set(prev)
        for (const id of ancestors) next.delete(id)
        return next
      })
    }
    openPage(pageId)
  }, [openPage])

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.innerWidth < 768) return

    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    let nextWidth = startWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampNumber(
        startWidth + moveEvent.clientX - startX,
        MIN_SIDEBAR_WIDTH,
        MAX_SIDEBAR_WIDTH,
      )
      setSidebarWidth(nextWidth)
    }

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(nextWidth)))
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }, [sidebarWidth])

  const uploadImageAsset = useCallback(async (file: File): Promise<UploadedImageAsset> => {
    if (!activeWorkspaceId || !activePageIdRef.current) {
      throw new Error('이미지를 업로드할 페이지를 찾을 수 없습니다.')
    }

    const formData = new FormData()
    formData.append('workspaceId', activeWorkspaceId)
    formData.append('pageId', activePageIdRef.current)
    formData.append('file', file)

    const response = await fetch('/api/assets', {
      method: 'POST',
      headers: authUploadHeaders(),
      body: formData,
    })

    if (!response.ok) {
      throw await readError(response, '이미지를 업로드하지 못했습니다.')
    }

    const data = await response.json() as UploadedImageAsset
    return {
      ...data,
      alt: file.name || data.alt || 'pasted image',
    }
  }, [activeWorkspaceId, authUploadHeaders])

  const cloneImageAsset = useCallback(async (source: {
    assetId?: string
    storagePath?: string
    src: string
    alt?: string
  }): Promise<UploadedImageAsset> => {
    if (!activeWorkspaceId || !activePageIdRef.current) {
      throw new Error('이미지를 복사할 페이지를 찾을 수 없습니다.')
    }

    const response = await fetch('/api/assets/clone', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        workspaceId: activeWorkspaceId,
        pageId: activePageIdRef.current,
        sourceAssetId: source.assetId,
        sourceStoragePath: source.storagePath,
      }),
    })

    if (!response.ok) {
      throw await readError(response, '이미지를 복사하지 못했습니다.')
    }

    const data = await response.json() as UploadedImageAsset
    return {
      ...data,
      alt: source.alt || data.alt || 'copied image',
    }
  }, [activeWorkspaceId, authHeaders])

  const resetClientState = useCallback(() => {
    const currentRoute = readSelectionFromPath(window.location.pathname)
    setSession(null)
    setWorkspacesLoading(false)
    setPagesLoading(false)
    setWorkspaces([])
    workspacesRef.current = []
    setPages([])
    setMembers([])
    pagesCache.current.clear()
    pagesRef.current = []
    routeResolutionSequenceRef.current += 1
    standalonePageIdRef.current = (
      currentRoute.kind === 'page' || currentRoute.kind === 'legacy-page'
        ? currentRoute.pageId
        : ''
    )
    activeWorkspaceIdRef.current = ''
    setActiveWorkspaceId('')
    selectActivePage('')
    setSettingsOpen(false)
  }, [selectActivePage])

  const loadWorkspaces = useCallback(async () => {
    if (!accessToken) return
    setError('')
    setWorkspacesLoading(true)
    try {
      const standalonePageId = standalonePageIdRef.current
      if (standalonePageId) standalonePageIdRef.current = ''
      const routeSequence = standalonePageId ? ++routeResolutionSequenceRef.current : 0
      const [response, standalonePageResponse] = await Promise.all([
        fetch('/api/workspaces', { headers: authHeaders() }),
        standalonePageId
          ? fetch(`/api/pages?id=${encodeURIComponent(standalonePageId)}`, { headers: authHeaders() })
            .catch(() => null)
          : Promise.resolve(null),
      ])
      if (!response.ok) throw await readError(response, '워크스페이스를 불러오지 못했습니다.')

      const data = await response.json() as Workspace[]
      workspacesRef.current = data
      setWorkspaces(data)

      if (standalonePageId && routeSequence === routeResolutionSequenceRef.current) {
        const currentRoute = readSelectionFromPath(window.location.pathname)
        if (currentRoute.pageId === standalonePageId && standalonePageResponse?.ok) {
          const standalonePage = await standalonePageResponse.json() as PageRecord
          if (activateResolvedPage(standalonePage, data)) return data
        }
        setError('요청한 페이지를 열 수 없어 기본 워크스페이스로 이동했습니다.')
      }

      const currentWorkspaceId = activeWorkspaceIdRef.current
      const nextWorkspaceId = data.some(workspace => workspace.id === currentWorkspaceId)
        ? currentWorkspaceId
        : data[0]?.id || ''
      activeWorkspaceIdRef.current = nextWorkspaceId
      setActiveWorkspaceId(nextWorkspaceId)
      if (nextWorkspaceId !== currentWorkspaceId) {
        updateSelectionUrl(nextWorkspaceId, undefined, 'replace')
      }
      return data
    } finally {
      setWorkspacesLoading(false)
    }
  }, [accessToken, activateResolvedPage, authHeaders])

  const loadPages = useCallback(async (
    workspaceId: string,
    options?: { background?: boolean },
  ) => {
    if (!accessToken || !workspaceId) return
    const background = options?.background ?? false
    setError('')
    if (!background) setPagesLoading(true)
    try {
      const response = await fetch(`/api/pages?workspaceId=${workspaceId}`, {
        headers: authHeaders(),
      })
      if (!response.ok) throw await readError(response, '페이지를 불러오지 못했습니다.')

      const data = await response.json() as PageRecord[]
      const fetchedAt = Date.now()
      for (const page of data) {
        pageFetchedAtRef.current.set(page.id, fetchedAt)
      }

      // reconcile: 미저장/저장 중 content는 로컬 우선으로 보존(저장 손실 방지).
      // 구조 변경(parent/order/title)은 서버 값을 수용.
      const currentById = new Map(pagesRef.current.map(page => [page.id, page]))
      const reconciled = data.map(serverPage => {
        const hasUnsaved = (
          saveTimers.current.has(serverPage.id) ||
          contentSaveInFlight.current.has(serverPage.id) ||
          pendingContent.current.has(serverPage.id)
        )
        if (!hasUnsaved) return serverPage
        const localContent = (
          pendingContent.current.get(serverPage.id) ??
          currentById.get(serverPage.id)?.content ??
          serverPage.content
        )
        return { ...serverPage, content: localContent }
      })

      // 아직 서버에 없는 '생성 중' 낙관적 페이지는 유지(재검증이 생성 중 페이지를 지우지 않도록).
      const serverIds = new Set(data.map(page => page.id))
      const pendingCreates = pagesRef.current.filter(page => (
        pendingCreateIds.current.has(page.id) && !serverIds.has(page.id)
      ))
      const merged = pendingCreates.length > 0 ? [...reconciled, ...pendingCreates] : reconciled

      // 캐시는 항상 갱신(빈 배열 포함). 키가 workspaceId라 응답 순서와 무관하게 정확.
      pagesCache.current.set(workspaceId, merged)

      // 화면 반영은 아직 같은 워크스페이스를 보고 있을 때만(전환 중 늦게 온 응답 무시).
      if (workspaceId === activeWorkspaceIdRef.current) {
        setPages(merged)
        const currentPageId = activePageIdRef.current
        const nextPageId = merged.some(page => page.id === currentPageId) ? currentPageId : merged[0]?.id || ''
        activePageIdRef.current = nextPageId
        setActivePageId(nextPageId)
        updateSelectionUrl(workspaceId, nextPageId || undefined, 'replace')
      }
    } finally {
      if (!background) setPagesLoading(false)
    }
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

    const cached = pagesCache.current.get(activeWorkspaceId)
    if (cached) {
      // 캐시 히트: 스켈레톤 없이 즉시 표시 + 백그라운드 재검증
      setPages(cached)
      const currentPageId = activePageIdRef.current
      const nextPageId = cached.some(page => page.id === currentPageId) ? currentPageId : cached[0]?.id || ''
      activePageIdRef.current = nextPageId
      setActivePageId(nextPageId)
      updateSelectionUrl(activeWorkspaceId, nextPageId || undefined, 'replace')
      loadPages(activeWorkspaceId, { background: true })
        .catch(err => setError(err instanceof Error ? err.message : '오류가 발생했습니다.'))
    } else {
      loadPages(activeWorkspaceId).catch(err => setError(err instanceof Error ? err.message : '오류가 발생했습니다.'))
    }
  }, [activeWorkspaceId, loadPages, selectActivePage])

  useEffect(() => {
    if (!activePageId || !accessToken) return
    const lastFetchedAt = pageFetchedAtRef.current.get(activePageId) ?? 0
    if (Date.now() - lastFetchedAt < PAGE_REVALIDATE_INTERVAL_MS) return

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
        pageFetchedAtRef.current.set(fresh.id, Date.now())
      })
      .catch(() => { /* 조용히 무시 */ })

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

  useEffect(() => {
    if (!workspaceMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!workspaceMenuRef.current?.contains(event.target)) {
        setWorkspaceMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [workspaceMenuOpen])

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

  // 접힘 상태 초기화/재동기화: 활성 워크스페이스가 바뀔 때마다 그 워크스페이스의 접힘 상태를
  // collapsedPages에 다시 로드한다. 같은 워크스페이스 내에서는(이미 로드됨) 재적용하지 않아
  // 사용자의 수동 토글을 보존한다.
  // 1) localStorage에 저장된 접힘 상태가 있으면 복원(삭제된 페이지 id는 제외).
  // 2) 없으면 AUTO_COLLAPSE_FROM_DEPTH 기준 depth 기반 기본 접힘 적용.
  useEffect(() => {
    if (!activeWorkspaceId) return
    // 이미 이 워크스페이스 상태가 로드되어 있으면 재동기화하지 않음(수동 토글 보존).
    if (collapsedWorkspaceRef.current === activeWorkspaceId) return
    // 전환 직후 pages가 아직 이전 워크스페이스 것일 수 있으므로 workspace_id로 가드.
    if (pages.length === 0 || pages[0].workspace_id !== activeWorkspaceId) return

    const validIds = new Set(pages.map(page => page.id))
    const storageKey = `${COLLAPSED_STORAGE_PREFIX}${activeWorkspaceId}`

    const computeCollapsed = (): Set<string> => {
      // 1) 저장된 상태 복원 시도
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            return new Set(
              parsed.filter((id): id is string => typeof id === 'string' && validIds.has(id))
            )
          }
        }
      } catch {
        // 손상된 저장값은 무시하고 기본값으로 진행
      }

      // 2) 저장값 없음: depth 기반 기본 접힘
      const parentById = new Map(pages.map(page => [page.id, page.parent_id]))
      const hasChildren = new Set(pages.map(page => page.parent_id).filter((id): id is string => Boolean(id)))
      const depthOf = (pageId: string) => {
        let depth = 0
        let current = parentById.get(pageId) ?? null
        const visited = new Set<string>()
        while (current && !visited.has(current)) {
          visited.add(current)
          depth += 1
          current = parentById.get(current) ?? null
        }
        return depth
      }
      const defaultCollapsed = new Set<string>()
      for (const page of pages) {
        if (hasChildren.has(page.id) && depthOf(page.id) >= AUTO_COLLAPSE_FROM_DEPTH) {
          defaultCollapsed.add(page.id)
        }
      }
      return defaultCollapsed
    }

    collapsedWorkspaceRef.current = activeWorkspaceId
    setCollapsedPages(computeCollapsed())
  }, [activeWorkspaceId, pages])

  // 접힘 상태 영구 저장: collapsedPages가 현재 활성 워크스페이스를 대표할 때만 저장한다.
  // (전환 직후 재동기화 전에는 이전 워크스페이스 상태가 남아있으므로 저장하지 않아 오염 방지)
  useEffect(() => {
    if (!activeWorkspaceId) return
    if (collapsedWorkspaceRef.current !== activeWorkspaceId) return
    try {
      localStorage.setItem(
        `${COLLAPSED_STORAGE_PREFIX}${activeWorkspaceId}`,
        JSON.stringify([...collapsedPages])
      )
    } catch {
      // 저장 실패(용량 초과 등)는 무시
    }
  }, [collapsedPages, activeWorkspaceId])

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
      setWorkspaces(previous => [...previous, { ...data.workspace, order_index: previous.length }])
      activeWorkspaceIdRef.current = data.workspace.id
      setActiveWorkspaceId(data.workspace.id)
      setWorkspaceName('')
      setWorkspaceMenuOpen(false)
      if (data.page) {
        pageFetchedAtRef.current.set(data.page.id, Date.now())
        setPages([data.page])
        selectActivePage(data.page.id)
        updateSelectionUrl(data.workspace.id, data.page.id, 'push')
      } else {
        updateSelectionUrl(data.workspace.id, undefined, 'push')
      }
    } finally {
      setCreatingWorkspace(false)
    }
  }

  const selectWorkspace = (workspaceId: string) => {
    activeWorkspaceIdRef.current = workspaceId
    setActiveWorkspaceId(workspaceId)
    selectActivePage('')
    updateSelectionUrl(workspaceId, undefined, 'push')
    setWorkspaceMenuOpen(false)
  }

  const persistWorkspaceOrder = async (orderedWorkspaces: Workspace[]) => {
    if (!accessToken) return

    const response = await fetch('/api/workspaces', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ orderIds: orderedWorkspaces.map(workspace => workspace.id) }),
    })

    if (!response.ok) {
      throw await readError(response, '워크스페이스 순서를 저장하지 못했습니다.')
    }
  }

  const reorderWorkspaces = async (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => {
    if (sourceId === targetId) return

    const previousWorkspaces = workspaces
    const sourceIndex = workspaces.findIndex(workspace => workspace.id === sourceId)
    const targetIndex = workspaces.findIndex(workspace => workspace.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const nextWorkspaces = [...workspaces]
    const [source] = nextWorkspaces.splice(sourceIndex, 1)
    const adjustedTargetIndex = nextWorkspaces.findIndex(workspace => workspace.id === targetId)
    const insertIndex = position === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1
    nextWorkspaces.splice(insertIndex, 0, source)

    setWorkspaces(nextWorkspaces.map((workspace, index) => ({ ...workspace, order_index: index })))
    setError('')

    try {
      await persistWorkspaceOrder(nextWorkspaces)
    } catch (err) {
      setWorkspaces(previousWorkspaces)
      setError(err instanceof Error ? err.message : '워크스페이스 순서를 저장하지 못했습니다.')
    }
  }

  const createPage = async (parentId: string | null = null) => {
    if (!activeWorkspaceId || !accessToken || !canEdit || creatingPage) return
    setError('')

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const title = newPageTitle.trim() || 'Untitled'
    const siblingCount = pages.filter(page => (page.parent_id ?? null) === (parentId ?? null)).length
    const optimisticPage: PageRecord = {
      id,
      workspace_id: activeWorkspaceId,
      parent_id: parentId,
      title,
      order_index: siblingCount,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      created_at: now,
      updated_at: now,
    }

    const previousPages = pages
    const previousActiveId = activePageIdRef.current

    // 낙관적 반영: 즉시 사이드바에 추가 + 활성화
    pendingCreateIds.current.add(id)
    pageFetchedAtRef.current.set(id, Date.now())
    setPages(previous => [...previous, optimisticPage])
    openPage(id)
    setNewPageTitle('')
    setCreatingPage(true)

    try {
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: authHeaders(),
        // 클라이언트가 정한 id로 insert → temp↔real 교체 불필요
        body: JSON.stringify({ id, workspaceId: activeWorkspaceId, parentId, title }),
      })
      if (!response.ok) throw await readError(response, '페이지를 만들지 못했습니다.')

      const page = await response.json() as PageRecord
      pageFetchedAtRef.current.set(page.id, Date.now())
      // 서버 레코드로 교체하되, 생성 중 사용자가 입력한 content는 보존
      setPages(previous => previous.map(item => (
        item.id === id
          ? { ...page, content: pendingContent.current.get(id) ?? item.content }
          : item
      )))
    } catch (err) {
      // 롤백: 낙관적 페이지 제거 + 이전 선택 복원
      pendingContent.current.delete(id)
      pageFetchedAtRef.current.delete(id)
      const timer = saveTimers.current.get(id)
      if (timer) { window.clearTimeout(timer); saveTimers.current.delete(id) }
      setPages(previousPages)
      activePageIdRef.current = previousActiveId
      setActivePageId(previousActiveId)
      updateSelectionUrl(activeWorkspaceId, previousActiveId || undefined, 'replace')
      setError(err instanceof Error ? err.message : '페이지를 만들지 못했습니다.')
    } finally {
      pendingCreateIds.current.delete(id)
      setCreatingPage(false)
      // 생성 진행 중 미뤄둔 content 저장을 지금 실행(가드로 지연됐던 입력 반영)
      if (pendingContent.current.has(id)) {
        const content = pendingContent.current.get(id)!
        const existing = saveTimers.current.get(id)
        if (existing) { window.clearTimeout(existing); saveTimers.current.delete(id) }
        updatePage(id, { content }).catch(saveErr => {
          setError(saveErr instanceof Error ? saveErr.message : '페이지를 저장하지 못했습니다.')
        })
      }
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
      pageFetchedAtRef.current.set(page.id, Date.now())
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
    debugSaveFlow('schedule content save', {
      pageId,
      activePageId: activePageIdRef.current,
      contentBlocks: Array.isArray(content.content) ? content.content.length : null,
    })
    pendingContent.current.set(pageId, content)

    // 생성 진행 중인 페이지는 서버에 아직 없으므로 저장(PATCH)을 예약하지 않는다.
    // content는 pendingContent에 버퍼되고, createPage 완료 후 flush된다(404 레이스 차단).
    if (pendingCreateIds.current.has(pageId)) return

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

    // 삭제 대상(하위 페이지 포함) 계산
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

    const previousPages = pages
    const previousActiveId = activePageIdRef.current

    // 타이머/펜딩 정리
    for (const deletedId of deletedIds) {
      pendingContent.current.delete(deletedId)
      pageFetchedAtRef.current.delete(deletedId)
      const saveTimer = saveTimers.current.get(deletedId)
      if (saveTimer) {
        window.clearTimeout(saveTimer)
        saveTimers.current.delete(deletedId)
      }
    }

    // 낙관적 제거: 즉시 사이드바에서 제거 + 선택 이동
    const remaining = pages.filter(page => !deletedIds.has(page.id))
    setPages(remaining)
    const nextPageId = deletedIds.has(activePageIdRef.current)
      ? remaining[0]?.id ?? ''
      : activePageIdRef.current
    activePageIdRef.current = nextPageId
    setActivePageId(nextPageId)
    updateSelectionUrl(activeWorkspaceId, nextPageId || undefined, 'replace')

    try {
      const response = await fetch(`/api/pages?id=${pageId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!response.ok) throw await readError(response, '페이지를 삭제하지 못했습니다.')
    } catch (err) {
      // 롤백: 삭제 전 상태로 복원
      setPages(previousPages)
      activePageIdRef.current = previousActiveId
      setActivePageId(previousActiveId)
      updateSelectionUrl(activeWorkspaceId, previousActiveId || undefined, 'replace')
      setError(err instanceof Error ? err.message : '페이지를 삭제하지 못했습니다.')
    }
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

  const movePage = useCallback(async (draggedId: string, targetId: string, position: PageDropPosition) => {
    if (draggedId === targetId || !accessToken) return
    const draggedPage = pages.find(p => p.id === draggedId)
    const targetPage = pages.find(p => p.id === targetId)
    if (!draggedPage || !targetPage) return

    const pagesById = new Map(pages.map(page => [page.id, page]))
    const isDescendantOf = (pageId: string, possibleAncestorId: string) => {
      let current = pagesById.get(pageId)
      const visited = new Set<string>()
      while (current?.parent_id && !visited.has(current.id)) {
        if (current.parent_id === possibleAncestorId) return true
        visited.add(current.id)
        current = pagesById.get(current.parent_id)
      }
      return false
    }

    const nextParentId = position === 'inside' ? targetPage.id : targetPage.parent_id
    if (nextParentId === draggedId || (nextParentId && isDescendantOf(nextParentId, draggedId))) return

    const byParent = new Map<string, PageRecord[]>()
    for (const page of pages) {
      if (page.id === draggedId) continue
      const key = page.parent_id ?? 'root'
      byParent.set(key, [...(byParent.get(key) ?? []), page])
    }

    for (const list of byParent.values()) {
      list.sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
    }

    const nextParentKey = nextParentId ?? 'root'
    const targetSiblings = [...(byParent.get(nextParentKey) ?? [])]
    const movedPage = { ...draggedPage, parent_id: nextParentId }

    if (position === 'inside') {
      targetSiblings.push(movedPage)
    } else {
      const targetIdx = targetSiblings.findIndex(p => p.id === targetId)
      if (targetIdx < 0) return
      const insertIdx = position === 'above' ? targetIdx : targetIdx + 1
      targetSiblings.splice(insertIdx, 0, movedPage)
    }
    byParent.set(nextParentKey, targetSiblings)

    const touchedParentKeys = new Set([draggedPage.parent_id ?? 'root', nextParentKey])
    const updates = new Map<string, PageRecord>()
    for (const parentKey of touchedParentKeys) {
      const list = byParent.get(parentKey) ?? []
      list.forEach((page, index) => {
        updates.set(page.id, {
          ...page,
          parent_id: parentKey === 'root' ? null : parentKey,
          order_index: index,
        })
      })
    }

    const nextPages = pages.map(page => updates.get(page.id) ?? page)
    const changed = nextPages.filter(page => {
      const original = pagesById.get(page.id)
      return original && (
        original.parent_id !== page.parent_id ||
        original.order_index !== page.order_index
      )
    })

    if (changed.length === 0) return

    setPages(nextPages)
    setCollapsedPages(previous => {
      if (position !== 'inside') return previous
      const next = new Set(previous)
      next.delete(targetId)
      return next
    })
    setError('')

    try {
      const responses = await Promise.all(changed.map(page =>
        fetch('/api/pages', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({
            id: page.id,
            parentId: page.parent_id,
            orderIndex: page.order_index,
          }),
        })
      ))

      const failed = responses.find(response => !response.ok)
      if (failed) throw await readError(failed, '페이지 위치를 저장하지 못했습니다.')
    } catch (err) {
      setPages(pages)
      setError(err instanceof Error ? err.message : '페이지 위치를 저장하지 못했습니다.')
    }
  }, [accessToken, authHeaders, pages])

  const renderPageList = (parentId: string | null, depth = 0): React.ReactNode => {
    const items = pageTree.get(parentId ?? 'root') ?? []
    return items.map(page => {
      const hasChildren = (pageTree.get(page.id)?.length ?? 0) > 0
      const isCollapsed = collapsedPages.has(page.id)
      const isActive = page.id === activePageId

      return (
        <div key={page.id}>
          {dragOver?.id === page.id && dragOver.position === 'above' && (
            <div className="h-0.5 rounded bg-[#baf7c8]" style={{ marginLeft: depth > 0 ? 12 + 20 : 0 }} />
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
            onDragOver={e => {
              e.preventDefault()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const relativeY = e.clientY - rect.top
              const position: PageDropPosition = (
                relativeY < rect.height * 0.25
                  ? 'above'
                  : relativeY > rect.height * 0.75
                    ? 'below'
                    : 'inside'
              )
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
              if (dragged) movePage(dragged, page.id, dragOver?.position ?? 'below')
              draggedIdRef.current = null
              setDragOver(null)
            }}
          >
            {/* 가로 연결선 — depth > 0 항목에만 표시 */}
            {depth > 0 && (
              <div className={`absolute -left-px top-1/2 h-px w-3 ${isActive ? 'bg-[#baf7c8]' : 'bg-[#6e6e6b]'}`} />
            )}

            {/* 셰브론 — 하위 페이지 있을 때만 활성 */}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); if (hasChildren) toggleCollapse(page.id) }}
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

            {/* 페이지 버튼 */}
            <button
              onClick={() => openPage(page.id)}
              className={`flex h-8 min-w-0 flex-1 items-center rounded-[4px] px-2 text-left text-sm transition-colors ${
                isActive
                  ? 'border border-black bg-[#baf7c8] font-black text-black shadow-[2px_2px_0_#000]'
                  : 'font-medium text-neutral-300 hover:bg-[#50504d] hover:text-white'
              }`}
            >
              <span className="block min-w-0 truncate">{page.title}</span>
            </button>

            {/* 액션 버튼 — hover 시 표시 */}
            <div className="flex shrink-0 gap-1 pl-1 opacity-0 transition-opacity group-hover/page-row:opacity-100 group-focus-within/page-row:opacity-100">
              {canEdit && (
                <button
                  onClick={() => createPage(page.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs text-neutral-400 hover:bg-[#50504d] hover:text-white"
                  title="하위 페이지 추가"
                >
                  +
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => setDeleteTargetId(page.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs text-neutral-400 hover:text-red-300"
                  title="페이지 삭제"
                >
                  ×
                </button>
              )}
              <button
                onClick={() => {
                  const content = pendingContent.current.get(page.id) ?? page.content
                  const md = tiptapToMarkdown(page.title, content)
                  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${page.title || 'untitled'}.md`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs text-neutral-400 hover:bg-[#50504d] hover:text-white"
                title="마크다운으로 다운로드"
              >
                ↓
              </button>
            </div>
          </div>

          {dragOver?.id === page.id && dragOver.position === 'below' && (
            <div className="h-0.5 rounded bg-[#baf7c8]" style={{ marginLeft: depth > 0 ? 12 + 20 : 0 }} />
          )}

          {/* 하위 페이지 — 세로 가이드라인 + 가로 연결선 */}
          {!isCollapsed && hasChildren && (
            <div className="ml-5 border-l border-[#6e6e6b]">
              {renderPageList(page.id, depth + 1)}
            </div>
          )}
        </div>
      )
    })
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
                        <span className="loading-dots text-[11px] font-bold tracking-widest text-neutral-200"><span>·</span><span>·</span><span>·</span></span>
                      ) : (
                        <span className="border border-black bg-[#baf7c8] px-1.5 text-[11px] font-black text-black">
                          {members.length}
                        </span>
                      )}
                    </div>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {membersLoading && members.length === 0 ? (
                        <MembersSkeleton />
                      ) : members.map(member => (
                          <div key={member.user_id} className="rounded-[8px] border border-black bg-[#62625f] px-2 py-2">
                            <p className="truncate text-xs font-bold text-white">
                              {member.email ?? member.user_id}
                            </p>
                            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${getRoleBadgeClass(member.role)}`}>
                              {member.role}
                            </span>
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
                        <div className="flex min-w-0 flex-1 overflow-hidden rounded-[8px] border border-black">
                          <button
                            type="button"
                            onClick={() => setInviteRole('editor')}
                            className={`flex-1 py-1.5 text-xs font-black uppercase transition-colors ${
                              inviteRole === 'editor' ? 'bg-[#fde68a] text-black' : 'bg-[#62625f] text-neutral-300 hover:text-white'
                            }`}
                          >editor</button>
                          <div className="w-px bg-black" />
                          <button
                            type="button"
                            onClick={() => setInviteRole('viewer')}
                            className={`flex-1 py-1.5 text-xs font-black uppercase transition-colors ${
                              inviteRole === 'viewer' ? 'bg-[#c4b5fd] text-black' : 'bg-[#62625f] text-neutral-300 hover:text-white'
                            }`}
                          >viewer</button>
                        </div>
                        <button
                          onClick={inviteMember}
                          disabled={!inviteEmail.trim() || inviteLoading}
                          className="h-9 rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] disabled:opacity-40"
                        >
                          {inviteLoading ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span> : '멤버 추가'}
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
        <aside
          className="relative flex w-full shrink-0 flex-col border-r border-black bg-[#62625f] md:w-[var(--sidebar-width)] max-md:border-r-0 max-md:border-b"
          style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
        >
        <div className="border-b border-black p-3">
          <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-normal text-white">
            Workspace
          </p>
          <div className="relative mb-2" ref={workspaceMenuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={workspaceMenuOpen}
              onClick={() => setWorkspaceMenuOpen(open => !open)}
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

            {workspaceMenuOpen && (
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
                    const dragPosition = workspaceDragOver?.id === workspace.id ? workspaceDragOver.position : null

                    return (
                      <button
                        key={workspace.id}
                        type="button"
                        draggable
                        role="menuitem"
                        aria-current={isActive}
                        title="드래그해서 순서 변경"
                        onClick={event => {
                          if (workspaceDragClickBlockedRef.current) {
                            event.preventDefault()
                            workspaceDragClickBlockedRef.current = false
                            return
                          }
                          selectWorkspace(workspace.id)
                        }}
                        onDragStart={event => {
                          workspaceDraggedIdRef.current = workspace.id
                          workspaceDragClickBlockedRef.current = true
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', workspace.id)
                        }}
                        onDragOver={event => {
                          const draggedId = workspaceDraggedIdRef.current
                          if (!draggedId || draggedId === workspace.id) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                          const rect = event.currentTarget.getBoundingClientRect()
                          const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                          setWorkspaceDragOver({ id: workspace.id, position })
                        }}
                        onDragLeave={() => {
                          setWorkspaceDragOver(current => current?.id === workspace.id ? null : current)
                        }}
                        onDrop={event => {
                          const draggedId = workspaceDraggedIdRef.current
                          if (!draggedId || draggedId === workspace.id) return
                          event.preventDefault()
                          const rect = event.currentTarget.getBoundingClientRect()
                          const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                          setWorkspaceDragOver(null)
                          reorderWorkspaces(draggedId, workspace.id, position)
                        }}
                        onDragEnd={() => {
                          workspaceDraggedIdRef.current = null
                          setWorkspaceDragOver(null)
                          window.setTimeout(() => {
                            workspaceDragClickBlockedRef.current = false
                          }, 0)
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
                  onSubmit={event => {
                    event.preventDefault()
                    createWorkspace()
                  }}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_38px] items-center gap-2">
                    <input
                      className="h-[38px] min-w-0 rounded-[8px] border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555] focus:shadow-[3px_3px_0_#000]"
                      placeholder="새 워크스페이스"
                      value={workspaceName}
                      onChange={event => setWorkspaceName(event.target.value)}
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
            )}
          </div>
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
                {renamingWorkspace ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span> : '✓'}
              </button>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[11px] font-black uppercase tracking-normal text-white">
              Pages
            </p>
            <div className="flex items-center gap-1.5">
              <span className="border border-black bg-[#baf7c8] px-1.5 text-xs font-black text-black">{pages.length}</span>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
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
              onChange={event => setNewPageTitle(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && createPage()}
              disabled={!activeWorkspaceId || !canEdit}
            />
            <button
              onClick={() => createPage()}
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
              pages.length > 0 ? renderPageList(null) : (
                pagesLoading ? (
                  <PageTreeSkeleton />
                ) : (
                  <div className="border border-dashed border-black bg-[#50504d] px-3 py-8 text-center">
                    <p className="text-sm font-black text-white">첫 페이지를 만들어보세요.</p>
                    <p className="mt-1 text-xs font-bold text-neutral-100">회의록, 체크리스트, 자료 정리부터 시작할 수 있습니다.</p>
                  </div>
                )
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
            onPointerDown={startSidebarResize}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto max-md:min-h-[60vh]">

        {error && (
          <div className="border-b border-black bg-red-300 px-6 py-3 text-sm font-bold text-black max-sm:px-4">
            <span className="font-black">처리 실패</span>
            <span className="ml-2">{error}</span>
          </div>
        )}

        {(workspacesLoading && workspaces.length === 0) || (pagesLoading && pages.length === 0) ? (
          <DocumentSkeleton />
        ) : activePage ? (
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
                    disabled={!canEdit}
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
              content={activePageContent}
              editable={Boolean(canEdit)}
              onChange={content => scheduleContentSave(activePage.id, content)}
              onUploadImage={canEdit ? uploadImageAsset : undefined}
              onCloneImage={canEdit ? cloneImageAsset : undefined}
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
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onPointerDown={() => setDeleteTargetId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-[8px] border border-black bg-[#62625f] p-5 text-white shadow-[6px_6px_0_#000]"
            onPointerDown={event => event.stopPropagation()}
          >
            <p className="text-sm font-black uppercase tracking-normal text-white">페이지 삭제</p>
            <p className="mt-3 text-sm font-medium leading-relaxed text-neutral-100">
              <span className="font-black text-white">{deleteTarget.title || 'Untitled'}</span>
              {deleteTargetHasChildren
                ? ' 페이지와 모든 하위 페이지를 삭제합니다.'
                : ' 페이지를 삭제합니다.'}
              {' 되돌릴 수 없습니다.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="h-9 rounded-[8px] border border-black bg-[#50504d] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#f7f4ec] hover:text-black hover:shadow-[3px_3px_0_#000]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = deleteTargetId
                  setDeleteTargetId(null)
                  if (targetId) {
                    deletePage(targetId).catch(err =>
                      setError(err instanceof Error ? err.message : '페이지를 삭제하지 못했습니다.')
                    )
                  }
                }}
                className="h-9 rounded-[8px] border border-black bg-[#fca5a5] px-4 text-xs font-black uppercase text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#f87171] hover:shadow-[3px_3px_0_#000]"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
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
