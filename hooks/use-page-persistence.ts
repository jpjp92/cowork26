'use client'

import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { notionLiteApi } from '../lib/notion-lite/api'
import type { PageRecord, SavingStatus, VisibleSavingStatus } from '../lib/notion-lite/types'

interface UsePagePersistenceOptions {
  accessToken: string | undefined
  canEdit: boolean
  activePageIdRef: MutableRefObject<string>
  onPageSavedRef: MutableRefObject<(page: PageRecord) => void>
  onError: (message: string) => void
}

export function usePagePersistence({
  accessToken,
  canEdit,
  activePageIdRef,
  onPageSavedRef,
  onError,
}: UsePagePersistenceOptions) {
  const [savingStatus, setSavingStatus] = useState<SavingStatus>('idle')
  const [visibleSavingStatus, setVisibleSavingStatus] = useState<VisibleSavingStatus>('loaded')
  const saveTimers = useRef(new Map<string, number>())
  const pendingContent = useRef(new Map<string, Record<string, unknown>>())
  const contentSaveInFlight = useRef(new Set<string>())
  const pendingCreateIds = useRef(new Set<string>())
  const savingResetTimerRef = useRef<number | null>(null)
  const titleFocusValueRef = useRef(new Map<string, string>())
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const showSavingStatus = useCallback((status: VisibleSavingStatus) => {
    if (savingResetTimerRef.current) {
      window.clearTimeout(savingResetTimerRef.current)
    }

    setSavingStatus(status)
    setVisibleSavingStatus(status)
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

  const updatePage = useCallback(async (
    pageId: string,
    patch: Partial<Pick<PageRecord, 'title' | 'content'>>,
  ) => {
    if (!accessToken || !canEdit) return
    const isContentSave = patch.content !== undefined
    if (isContentSave) contentSaveInFlight.current.add(pageId)

    try {
      const page = await notionLiteApi.updatePage(accessToken, pageId, patch)
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
    } catch (error) {
      onErrorRef.current(error instanceof Error ? error.message : '페이지를 저장하지 못했습니다.')
    } finally {
      if (isContentSave) contentSaveInFlight.current.delete(pageId)
    }
  }, [accessToken, activePageIdRef, canEdit, onPageSavedRef, showSavingStatus])

  const scheduleContentSave = useCallback((pageId: string, content: Record<string, unknown>) => {
    if (!canEdit) return
    pendingContent.current.set(pageId, content)
    if (pendingCreateIds.current.has(pageId)) return

    const existingTimer = saveTimers.current.get(pageId)
    if (existingTimer) window.clearTimeout(existingTimer)

    const nextTimer = window.setTimeout(() => {
      saveTimers.current.delete(pageId)
      updatePage(pageId, { content }).catch(error => {
        setSavingStatus('idle')
        onErrorRef.current(error instanceof Error ? error.message : '페이지를 저장하지 못했습니다.')
      })
    }, 1500)
    saveTimers.current.set(pageId, nextTimer)
  }, [canEdit, updatePage])

  const flushPendingContentSaves = useCallback(async () => {
    const pendingEntries = Array.from(pendingContent.current.entries())
    if (pendingEntries.length === 0) return

    for (const pageId of pendingContent.current.keys()) {
      const saveTimer = saveTimers.current.get(pageId)
      if (saveTimer) {
        window.clearTimeout(saveTimer)
        saveTimers.current.delete(pageId)
      }
    }

    await Promise.all(pendingEntries.map(([pageId, content]) => updatePage(pageId, { content })))
  }, [updatePage])

  const getEffectiveContent = useCallback((page: PageRecord) => {
    return pendingContent.current.get(page.id) ?? page.content
  }, [])

  const clearPagePersistence = useCallback((pageIds: Iterable<string>) => {
    for (const pageId of pageIds) {
      pendingContent.current.delete(pageId)
      pendingCreateIds.current.delete(pageId)
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
  }, [])

  const consumePreviousTitle = useCallback((pageId: string, fallback: string) => {
    const previousTitle = titleFocusValueRef.current.get(pageId) ?? fallback
    titleFocusValueRef.current.delete(pageId)
    return previousTitle
  }, [])

  const resetPagePersistence = useCallback(() => {
    for (const timer of saveTimers.current.values()) window.clearTimeout(timer)
    saveTimers.current.clear()
    pendingContent.current.clear()
    contentSaveInFlight.current.clear()
    pendingCreateIds.current.clear()
    titleFocusValueRef.current.clear()
    resetSavingStatus()
  }, [resetSavingStatus])

  useEffect(() => resetPagePersistence, [resetPagePersistence])

  return {
    savingStatus,
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
  }
}
