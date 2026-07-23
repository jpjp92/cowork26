'use client'

import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { notionLiteApi } from '../lib/notion-lite/api'
import { planPageMove } from '../lib/notion-lite/page-move'
import { collectPageAndDescendantIds } from '../lib/notion-lite/page-tree'
import type { PageDropPosition, PageRecord } from '../lib/notion-lite/types'

interface CreatePageOptions {
  workspaceId: string
  parentId: string | null
  title: string
  onOpen: (pageId: string) => void
  onSelectionChange: (workspaceId: string, pageId: string) => void
}

interface DeletePageOptions {
  workspaceId: string
  onSelectionChange: (workspaceId: string, pageId: string) => void
}

interface UsePageDataOptions {
  accessToken: string | undefined
  activeWorkspaceId: string
  activePageId: string
  activeWorkspaceIdRef: MutableRefObject<string>
  activePageIdRef: MutableRefObject<string>
  saveTimers: MutableRefObject<Map<string, number>>
  pendingContent: MutableRefObject<Map<string, Record<string, unknown>>>
  contentSaveInFlight: MutableRefObject<Set<string>>
  pendingCreateIds: MutableRefObject<Set<string>>
  clearPagePersistence: (pageIds: Iterable<string>) => void
  markPageCreating: (pageId: string) => void
  finishPageCreating: (pageId: string) => Promise<void>
  onLoadedPageSelection: (workspaceId: string, pageId: string) => void
  selectActivePage: (pageId: string) => void
  showLoadedStatus: () => void
  onError: (message: string) => void
  revalidateIntervalMs: number
}

export function usePageData({
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
  onLoadedPageSelection,
  selectActivePage,
  showLoadedStatus,
  onError,
  revalidateIntervalMs,
}: UsePageDataOptions) {
  const [pages, setPages] = useState<PageRecord[]>([])
  const [pagesLoading, setPagesLoading] = useState(false)
  const [loadedPagesWorkspaceId, setLoadedPagesWorkspaceId] = useState('')
  const [creatingPage, setCreatingPage] = useState(false)
  const pagesRef = useRef<PageRecord[]>([])
  const pagesCache = useRef(new Map<string, PageRecord[]>())
  const pageFetchedAtRef = useRef(new Map<string, number>())
  const fullyLoadedWorkspaceIdsRef = useRef(new Set<string>())

  useEffect(() => {
    pagesRef.current = pages
    if (!activeWorkspaceId) return
    if (pages.length > 0 && pages[0].workspace_id === activeWorkspaceId) {
      pagesCache.current.set(activeWorkspaceId, pages)
    }
  }, [activeWorkspaceId, pages])

  const loadPages = useCallback(async (
    workspaceId: string,
    options?: { background?: boolean },
  ) => {
    if (!accessToken || !workspaceId) return
    const background = options?.background ?? false
    if (!background) setPagesLoading(true)

    try {
      const data = await notionLiteApi.listPages(accessToken, workspaceId)
      const fetchedAt = Date.now()
      for (const page of data) pageFetchedAtRef.current.set(page.id, fetchedAt)

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

      const serverIds = new Set(data.map(page => page.id))
      const pendingCreates = pagesRef.current.filter(page => (
        pendingCreateIds.current.has(page.id) && !serverIds.has(page.id)
      ))
      const merged = pendingCreates.length > 0 ? [...reconciled, ...pendingCreates] : reconciled
      pagesCache.current.set(workspaceId, merged)
      fullyLoadedWorkspaceIdsRef.current.add(workspaceId)

      if (workspaceId === activeWorkspaceIdRef.current) {
        setPages(merged)
        setLoadedPagesWorkspaceId(workspaceId)
        const currentPageId = activePageIdRef.current
        const nextPageId = merged.some(page => page.id === currentPageId)
          ? currentPageId
          : merged[0]?.id || ''
        onLoadedPageSelection(workspaceId, nextPageId)
      }
      return merged
    } finally {
      if (!background) setPagesLoading(false)
    }
  }, [
    accessToken,
    activePageIdRef,
    activeWorkspaceIdRef,
    contentSaveInFlight,
    onLoadedPageSelection,
    pendingContent,
    saveTimers,
  ])

  useEffect(() => {
    onError('')
    if (!activeWorkspaceId) {
      setPages([])
      setLoadedPagesWorkspaceId('')
      selectActivePage('')
      return
    }

    const cached = pagesCache.current.get(activeWorkspaceId)
    if (cached) {
      setPages(cached)
      setLoadedPagesWorkspaceId(
        fullyLoadedWorkspaceIdsRef.current.has(activeWorkspaceId) ? activeWorkspaceId : ''
      )
      const currentPageId = activePageIdRef.current
      const nextPageId = cached.some(page => page.id === currentPageId)
        ? currentPageId
        : cached[0]?.id || ''
      onLoadedPageSelection(activeWorkspaceId, nextPageId)
      loadPages(activeWorkspaceId, { background: true })
        .catch(error => onError(error instanceof Error ? error.message : '오류가 발생했습니다.'))
      return
    }

    setLoadedPagesWorkspaceId('')
    loadPages(activeWorkspaceId)
      .catch(error => onError(error instanceof Error ? error.message : '오류가 발생했습니다.'))
  }, [activeWorkspaceId, loadPages, onError, onLoadedPageSelection, selectActivePage])

  useEffect(() => {
    if (!activePageId || !accessToken) return
    const lastFetchedAt = pageFetchedAtRef.current.get(activePageId) ?? 0
    if (Date.now() - lastFetchedAt < revalidateIntervalMs) return

    const abortController = new AbortController()
    notionLiteApi.getPage(accessToken, activePageId, abortController.signal)
      .then(fresh => {
        if (fresh.id !== activePageIdRef.current) return
        showLoadedStatus()

        const hasUnsavedLocalContent = (
          saveTimers.current.has(fresh.id) || contentSaveInFlight.current.has(fresh.id)
        )
        if (!hasUnsavedLocalContent) {
          pendingContent.current.delete(fresh.id)
          setPages(previous => previous.map(page => page.id === fresh.id ? fresh : page))
        }
        pageFetchedAtRef.current.set(fresh.id, Date.now())
      })
      .catch(() => { /* 조용히 무시 */ })

    return () => abortController.abort()
  }, [
    accessToken,
    activePageId,
    activePageIdRef,
    contentSaveInFlight,
    pendingContent,
    revalidateIntervalMs,
    saveTimers,
    showLoadedStatus,
  ])

  const resetPageData = useCallback(() => {
    setPages([])
    setPagesLoading(false)
    setLoadedPagesWorkspaceId('')
    setCreatingPage(false)
    pagesRef.current = []
    pagesCache.current.clear()
    pageFetchedAtRef.current.clear()
    fullyLoadedWorkspaceIdsRef.current.clear()
    pendingCreateIds.current.clear()
  }, [])

  const createPage = useCallback(async ({
    workspaceId,
    parentId,
    title,
    onOpen,
    onSelectionChange,
  }: CreatePageOptions) => {
    if (!accessToken || creatingPage) return

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const siblingCount = pages.filter(page => (
      (page.parent_id ?? null) === (parentId ?? null)
    )).length
    const optimisticPage: PageRecord = {
      id,
      workspace_id: workspaceId,
      parent_id: parentId,
      title,
      order_index: siblingCount,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      created_at: now,
      updated_at: now,
    }
    const previousPages = pages
    const previousActiveId = activePageIdRef.current

    markPageCreating(id)
    pageFetchedAtRef.current.set(id, Date.now())
    setPages(previous => [...previous, optimisticPage])
    onOpen(id)
    setCreatingPage(true)

    try {
      const page = await notionLiteApi.createPage(accessToken, {
        id,
        workspaceId,
        parentId,
        title,
      })
      pageFetchedAtRef.current.set(page.id, Date.now())
      setPages(previous => previous.map(item => (
        item.id === id
          ? { ...page, content: pendingContent.current.get(id) ?? item.content }
          : item
      )))
      return page
    } catch (error) {
      clearPagePersistence([id])
      pageFetchedAtRef.current.delete(id)
      setPages(previousPages)
      onSelectionChange(workspaceId, previousActiveId)
      throw error
    } finally {
      setCreatingPage(false)
      await finishPageCreating(id)
    }
  }, [
    accessToken,
    activePageIdRef,
    clearPagePersistence,
    creatingPage,
    finishPageCreating,
    markPageCreating,
    pages,
    pendingContent,
  ])

  const deletePage = useCallback(async (
    pageId: string,
    { workspaceId, onSelectionChange }: DeletePageOptions,
  ) => {
    if (!accessToken) return

    const deletedIds = collectPageAndDescendantIds(pageId, pages)
    const previousPages = pages
    const previousActiveId = activePageIdRef.current

    clearPagePersistence(deletedIds)
    for (const deletedId of deletedIds) {
      pageFetchedAtRef.current.delete(deletedId)
    }

    const remaining = pages.filter(page => !deletedIds.has(page.id))
    setPages(remaining)
    const nextPageId = deletedIds.has(previousActiveId)
      ? remaining[0]?.id ?? ''
      : previousActiveId
    onSelectionChange(workspaceId, nextPageId)

    try {
      await notionLiteApi.deletePage(accessToken, pageId)
    } catch (error) {
      setPages(previousPages)
      onSelectionChange(workspaceId, previousActiveId)
      throw error
    }
  }, [accessToken, activePageIdRef, clearPagePersistence, pages])

  const movePage = useCallback(async (
    draggedId: string,
    targetId: string,
    position: PageDropPosition,
    onExpandPage: (pageId: string) => void,
  ) => {
    if (!accessToken) return
    const move = planPageMove(pages, draggedId, targetId, position)
    if (!move) return

    setPages(move.pages)
    if (move.expandPageId) onExpandPage(move.expandPageId)
    try {
      await notionLiteApi.movePages(accessToken, move.changed)
    } catch (error) {
      setPages(pages)
      throw error
    }
  }, [accessToken, pages])

  return {
    pages,
    setPages,
    pagesLoading,
    loadedPagesWorkspaceId,
    creatingPage,
    pagesRef,
    pagesCache,
    pageFetchedAtRef,
    pendingCreateIds,
    loadPages,
    createPage,
    deletePage,
    movePage,
    resetPageData,
  }
}
