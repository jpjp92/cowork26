'use client'

import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { notionLiteApi } from '../lib/notion-lite/api'
import { getSelectionPath, readSelectionFromPath } from '../lib/selection-route'
import type { PageRecord } from '../lib/notion-lite/types'

interface UseSelectionNavigationOptions {
  initialWorkspaceId: string
  initialPageId: string
  accessToken: string | undefined
  findPageRef: MutableRefObject<(pageId: string) => PageRecord | null>
  seedResolvedPageRef: MutableRefObject<(page: PageRecord) => boolean>
  getFallbackWorkspaceIdRef: MutableRefObject<() => string>
  resetSavingStatusRef: MutableRefObject<() => void>
}

interface StandalonePageRequest {
  pageId: string
  sequence: number
}

function updateSelectionUrl(
  workspaceId: string,
  pageId: string | undefined,
  history: 'push' | 'replace',
) {
  const path = workspaceId ? getSelectionPath(workspaceId, pageId) : '/'
  if (window.location.pathname === path) return

  const state = { ...window.history.state, coworkSelection: true }
  if (history === 'push') window.history.pushState(state, '', path)
  else window.history.replaceState(state, '', path)
}

export function useSelectionNavigation({
  initialWorkspaceId,
  initialPageId,
  accessToken,
  findPageRef,
  seedResolvedPageRef,
  getFallbackWorkspaceIdRef,
  resetSavingStatusRef,
}: UseSelectionNavigationOptions) {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaceId)
  const [activePageId, setActivePageId] = useState(initialPageId)
  const activeWorkspaceIdRef = useRef(activeWorkspaceId)
  const activePageIdRef = useRef(activePageId)
  const routeResolutionSequenceRef = useRef(0)
  const standalonePageIdRef = useRef(initialPageId && !initialWorkspaceId ? initialPageId : '')

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId
  }, [activeWorkspaceId])

  useEffect(() => {
    activePageIdRef.current = activePageId
  }, [activePageId])

  const selectActivePage = useCallback((pageId: string) => {
    activePageIdRef.current = pageId
    resetSavingStatusRef.current()
    setActivePageId(pageId)
  }, [resetSavingStatusRef])

  const replaceLoadedPageSelection = useCallback((workspaceId: string, pageId: string) => {
    activePageIdRef.current = pageId
    setActivePageId(pageId)
    updateSelectionUrl(workspaceId, pageId || undefined, 'replace')
  }, [])

  const openPage = useCallback((pageId: string, history: 'push' | 'replace' = 'push') => {
    const workspaceId = activeWorkspaceIdRef.current
    selectActivePage(pageId)
    if (workspaceId && pageId) updateSelectionUrl(workspaceId, pageId, history)
  }, [selectActivePage])

  const selectWorkspace = useCallback((workspaceId: string) => {
    activeWorkspaceIdRef.current = workspaceId
    setActiveWorkspaceId(workspaceId)
    selectActivePage('')
    updateSelectionUrl(workspaceId, undefined, 'push')
  }, [selectActivePage])

  const selectWorkspacePage = useCallback((
    workspaceId: string,
    pageId: string,
    history: 'push' | 'replace',
  ) => {
    activeWorkspaceIdRef.current = workspaceId
    setActiveWorkspaceId(workspaceId)
    selectActivePage(pageId)
    updateSelectionUrl(workspaceId, pageId || undefined, history)
  }, [selectActivePage])

  const replaceWorkspaceSelection = useCallback((workspaceId: string) => {
    activeWorkspaceIdRef.current = workspaceId
    setActiveWorkspaceId(workspaceId)
    selectActivePage('')
    updateSelectionUrl(workspaceId, undefined, 'replace')
  }, [selectActivePage])

  const activateResolvedPage = useCallback((page: PageRecord) => {
    if (!seedResolvedPageRef.current(page)) return false
    activeWorkspaceIdRef.current = page.workspace_id
    setActiveWorkspaceId(page.workspace_id)
    selectActivePage(page.id)
    updateSelectionUrl(page.workspace_id, page.id, 'replace')
    return true
  }, [seedResolvedPageRef, selectActivePage])

  const fallbackFromInvalidPageRoute = useCallback(() => {
    replaceWorkspaceSelection(getFallbackWorkspaceIdRef.current())
  }, [getFallbackWorkspaceIdRef, replaceWorkspaceSelection])

  const resolvePageRoute = useCallback(async (pageId: string) => {
    if (!pageId) return
    const sequence = ++routeResolutionSequenceRef.current
    const cachedPage = findPageRef.current(pageId)
    if (cachedPage) {
      if (sequence === routeResolutionSequenceRef.current) activateResolvedPage(cachedPage)
      return
    }
    if (!accessToken) return

    try {
      const page = await notionLiteApi.getPage(accessToken, pageId)
      if (sequence !== routeResolutionSequenceRef.current) return
      if (readSelectionFromPath(window.location.pathname).pageId !== pageId) return
      if (!activateResolvedPage(page)) fallbackFromInvalidPageRoute()
    } catch {
      if (sequence === routeResolutionSequenceRef.current) fallbackFromInvalidPageRoute()
    }
  }, [accessToken, activateResolvedPage, fallbackFromInvalidPageRoute, findPageRef])

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
  }, [initialPageId, initialWorkspaceId, selectActivePage])

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

  const takeStandalonePageRequest = useCallback((): StandalonePageRequest | null => {
    const pageId = standalonePageIdRef.current
    if (!pageId) return null
    standalonePageIdRef.current = ''
    return { pageId, sequence: ++routeResolutionSequenceRef.current }
  }, [])

  const tryActivateStandalonePage = useCallback((
    request: StandalonePageRequest,
    page: PageRecord | null,
  ) => {
    if (request.sequence !== routeResolutionSequenceRef.current) return false
    if (readSelectionFromPath(window.location.pathname).pageId !== request.pageId) return false
    return page ? activateResolvedPage(page) : false
  }, [activateResolvedPage])

  const resetSelection = useCallback(() => {
    const currentRoute = readSelectionFromPath(window.location.pathname)
    routeResolutionSequenceRef.current += 1
    standalonePageIdRef.current = (
      currentRoute.kind === 'page' || currentRoute.kind === 'legacy-page'
        ? currentRoute.pageId
        : ''
    )
    activeWorkspaceIdRef.current = ''
    setActiveWorkspaceId('')
    selectActivePage('')
  }, [selectActivePage])

  return {
    activeWorkspaceId,
    activePageId,
    activeWorkspaceIdRef,
    activePageIdRef,
    selectActivePage,
    replaceLoadedPageSelection,
    openPage,
    selectWorkspace,
    selectWorkspacePage,
    replaceWorkspaceSelection,
    takeStandalonePageRequest,
    tryActivateStandalonePage,
    resetSelection,
  }
}
