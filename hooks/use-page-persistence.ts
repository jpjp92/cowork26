'use client'

import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { notionLiteApi } from '../lib/notion-lite/api'
import { ApiRequestError } from '../lib/notion-lite/api'
import type { PageRecord, SavingStatus, VisibleSavingStatus } from '../lib/notion-lite/types'
import { PageSaveCoordinator } from './use-page-save-coordinator'

interface UsePagePersistenceOptions {
  accessToken: string | undefined
  canEdit: boolean
  activePageIdRef: MutableRefObject<string>
  getPageRef: MutableRefObject<(pageId: string) => PageRecord | null>
  onPageSavedRef: MutableRefObject<(page: PageRecord) => void>
  onError: (message: string) => void
}

export function usePagePersistence({
  accessToken,
  canEdit,
  activePageIdRef,
  getPageRef,
  onPageSavedRef,
  onError,
}: UsePagePersistenceOptions) {
  const [savingStatus, setSavingStatus] = useState<SavingStatus>('idle')
  const [visibleSavingStatus, setVisibleSavingStatus] = useState<VisibleSavingStatus>('loaded')
  const saveTimers = useRef(new Map<string, number>())
  const pendingContent = useRef(new Map<string, Record<string, unknown>>())
  const pendingTitles = useRef(new Map<string, string>())
  const contentSaveInFlight = useRef(new Set<string>())
  const pendingCreateIds = useRef(new Set<string>())
  const savingResetTimerRef = useRef<number | null>(null)
  const titleFocusValueRef = useRef(new Map<string, string>())
  const pageRevisionsRef = useRef(new Map<string, number>())
  const saveCountsRef = useRef(new Map<string, number>())
  const conflictedPageIdsRef = useRef(new Set<string>())
  const saveCoordinatorRef = useRef(new PageSaveCoordinator())
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const showSavingStatus = useCallback((status: VisibleSavingStatus) => {
    if (savingResetTimerRef.current) {
      window.clearTimeout(savingResetTimerRef.current)
    }

    setSavingStatus(status)
    setVisibleSavingStatus(status)
    if (status === 'conflict') return
    savingResetTimerRef.current = window.setTimeout(() => {
      setSavingStatus('idle')
      savingResetTimerRef.current = null
    }, 1200)
  }, [])

  const resetSavingStatus = useCallback(() => {
    if (savingResetTimerRef.current) {
      window.clearTimeout(savingResetTimerRef.current)
      savingResetTimerRef.current = null
    }
    setSavingStatus('idle')
  }, [])

  const updatePage = useCallback((
    pageId: string,
    patch: Partial<Pick<PageRecord, 'title' | 'content'>>,
  ) => {
    if (!accessToken || !canEdit) return Promise.resolve(undefined)
    const isContentSave = patch.content !== undefined
    const isRevisionedSave = patch.title !== undefined || patch.content !== undefined
    const saveCount = (saveCountsRef.current.get(pageId) ?? 0) + 1
    saveCountsRef.current.set(pageId, saveCount)
    if (isContentSave) contentSaveInFlight.current.add(pageId)

    const request = saveCoordinatorRef.current.enqueue(pageId, async () => {
      if (isRevisionedSave && conflictedPageIdsRef.current.has(pageId)) {
        throw new ApiRequestError(
          '페이지 충돌을 해결하기 전에는 저장할 수 없습니다.',
          409,
          'PAGE_REVISION_CONFLICT',
        )
      }

      const currentPage = getPageRef.current(pageId)
      const knownRevision = pageRevisionsRef.current.get(pageId)
      const baseRevision = knownRevision ?? currentPage?.content_revision
      if (isRevisionedSave && baseRevision === undefined) {
        throw new Error('페이지 revision을 확인하지 못해 저장을 중단했습니다.')
      }

      const page = await notionLiteApi.updatePage(accessToken, pageId, {
        ...patch,
        ...(isRevisionedSave ? { baseRevision } : {}),
      })
      pageRevisionsRef.current.set(page.id, page.content_revision)
      const currentPendingTitle = pendingTitles.current.get(page.id)
      if (
        patch.title !== undefined &&
        currentPendingTitle !== undefined &&
        (currentPendingTitle.trim() || 'Untitled') === page.title
      ) {
        pendingTitles.current.delete(page.id)
      }
      const currentPendingContent = pendingContent.current.get(page.id)
      if (
        currentPendingContent &&
        JSON.stringify(currentPendingContent) === JSON.stringify(page.content ?? null)
      ) {
        pendingContent.current.delete(page.id)
      }

      onPageSavedRef.current(page)
      if (pageId === activePageIdRef.current) showSavingStatus('saved')
      return page
    })

    return request.catch(error => {
      if (error instanceof ApiRequestError && error.code === 'PAGE_REVISION_CONFLICT') {
        conflictedPageIdsRef.current.add(pageId)
        if (pageId === activePageIdRef.current) showSavingStatus('conflict')
        onErrorRef.current('다른 창에서 페이지가 수정되었습니다. 로컬 내용은 유지했으며 자동 저장을 중단했습니다.')
      } else {
        onErrorRef.current(error instanceof Error ? error.message : '페이지를 저장하지 못했습니다.')
      }
      throw error
    }).finally(() => {
      const remaining = (saveCountsRef.current.get(pageId) ?? 1) - 1
      if (remaining <= 0) {
        saveCountsRef.current.delete(pageId)
        contentSaveInFlight.current.delete(pageId)
      } else {
        saveCountsRef.current.set(pageId, remaining)
      }
    })
  }, [accessToken, activePageIdRef, canEdit, getPageRef, onPageSavedRef, showSavingStatus])

  const scheduleContentSave = useCallback((pageId: string, content: Record<string, unknown>) => {
    if (!canEdit) return
    const visibleRevision = getPageRef.current(pageId)?.content_revision
    if (!pageRevisionsRef.current.has(pageId) && visibleRevision !== undefined) {
      pageRevisionsRef.current.set(pageId, visibleRevision)
    }
    pendingContent.current.set(pageId, content)
    if (pendingCreateIds.current.has(pageId)) return

    const existingTimer = saveTimers.current.get(pageId)
    if (existingTimer) window.clearTimeout(existingTimer)

    const nextTimer = window.setTimeout(() => {
      saveTimers.current.delete(pageId)
      updatePage(pageId, { content }).catch(error => {
        setSavingStatus('idle')
      })
    }, 1500)
    saveTimers.current.set(pageId, nextTimer)
  }, [canEdit, getPageRef, updatePage])

  const flushPendingContentSaves = useCallback(async () => {
    const pageIds = new Set([
      ...pendingContent.current.keys(),
      ...contentSaveInFlight.current.values(),
    ])

    for (const pageId of pageIds) {
      const saveTimer = saveTimers.current.get(pageId)
      if (saveTimer) window.clearTimeout(saveTimer)
      saveTimers.current.delete(pageId)
    }

    for (const pageId of pageIds) {
      let attempts = 0
      while (pendingContent.current.has(pageId)) {
        if (attempts++ >= 10) {
          throw new Error('편집이 계속되어 저장을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.')
        }
        const content = pendingContent.current.get(pageId)
        if (!content) break
        await updatePage(pageId, { content })
      }
    }

    await saveCoordinatorRef.current.waitFor(pageIds)
  }, [updatePage])

  const getEffectiveContent = useCallback((page: PageRecord) => {
    return pendingContent.current.get(page.id) ?? page.content
  }, [])

  const trackPendingTitle = useCallback((pageId: string, title: string) => {
    pendingTitles.current.set(pageId, title)
  }, [])

  const clearPendingTitle = useCallback((pageId: string) => {
    pendingTitles.current.delete(pageId)
  }, [])

  const clearPagePersistence = useCallback((pageIds: Iterable<string>) => {
    for (const pageId of pageIds) {
      pendingContent.current.delete(pageId)
      pendingTitles.current.delete(pageId)
      pendingCreateIds.current.delete(pageId)
      pageRevisionsRef.current.delete(pageId)
      conflictedPageIdsRef.current.delete(pageId)
      const saveTimer = saveTimers.current.get(pageId)
      if (saveTimer) {
        window.clearTimeout(saveTimer)
        saveTimers.current.delete(pageId)
      }
    }
  }, [])

  const markPageCreating = useCallback((pageId: string) => {
    pendingCreateIds.current.add(pageId)
  }, [])

  const finishPageCreating = useCallback(async (pageId: string) => {
    pendingCreateIds.current.delete(pageId)
    const content = pendingContent.current.get(pageId)
    if (!content) return

    const saveTimer = saveTimers.current.get(pageId)
    if (saveTimer) {
      window.clearTimeout(saveTimer)
      saveTimers.current.delete(pageId)
    }
    await updatePage(pageId, { content })
  }, [updatePage])

  const rememberTitle = useCallback((pageId: string, title: string) => {
    titleFocusValueRef.current.set(pageId, title)
    const visibleRevision = getPageRef.current(pageId)?.content_revision
    if (!pageRevisionsRef.current.has(pageId) && visibleRevision !== undefined) {
      pageRevisionsRef.current.set(pageId, visibleRevision)
    }
  }, [getPageRef])

  const consumePreviousTitle = useCallback((pageId: string, fallback: string) => {
    const previousTitle = titleFocusValueRef.current.get(pageId) ?? fallback
    titleFocusValueRef.current.delete(pageId)
    return previousTitle
  }, [])

  const resetPagePersistence = useCallback(() => {
    for (const timer of saveTimers.current.values()) window.clearTimeout(timer)
    saveTimers.current.clear()
    pendingContent.current.clear()
    pendingTitles.current.clear()
    contentSaveInFlight.current.clear()
    pendingCreateIds.current.clear()
    titleFocusValueRef.current.clear()
    pageRevisionsRef.current.clear()
    saveCountsRef.current.clear()
    conflictedPageIdsRef.current.clear()
    saveCoordinatorRef.current = new PageSaveCoordinator()
    resetSavingStatus()
  }, [resetSavingStatus])

  useEffect(() => resetPagePersistence, [resetPagePersistence])

  return {
    savingStatus,
    visibleSavingStatus,
    saveTimers,
    pendingContent,
    pendingTitles,
    contentSaveInFlight,
    pendingCreateIds,
    showSavingStatus,
    resetSavingStatus,
    updatePage,
    scheduleContentSave,
    flushPendingContentSaves,
    getEffectiveContent,
    trackPendingTitle,
    clearPendingTitle,
    clearPagePersistence,
    markPageCreating,
    finishPageCreating,
    rememberTitle,
    consumePreviousTitle,
    resetPagePersistence,
  }
}
