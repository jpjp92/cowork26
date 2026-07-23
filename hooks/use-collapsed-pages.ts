'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { resolveInitialCollapsedPageIds } from '../lib/notion-lite/page-tree'
import type { PageRecord } from '../lib/notion-lite/types'

interface UseCollapsedPagesOptions {
  workspaceId: string
  pages: PageRecord[]
  pagesReady: boolean
  storagePrefix: string
  collapseFromDepth: number
}

export function useCollapsedPages({
  workspaceId,
  pages,
  pagesReady,
  storagePrefix,
  collapseFromDepth,
}: UseCollapsedPagesOptions) {
  const [collapseState, setCollapseState] = useState<{
    workspaceId: string
    pageIds: Set<string>
    hydrated: boolean
  }>({ workspaceId: '', pageIds: new Set(), hydrated: false })

  useLayoutEffect(() => {
    if (!workspaceId || !pagesReady) return
    if (collapseState.workspaceId === workspaceId && collapseState.hydrated) return
    if (pages.some(page => page.workspace_id !== workspaceId)) return

    const storageKey = `${storagePrefix}${workspaceId}`
    let storedValue: unknown = null
    let storageVersion: string | null = null

    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw !== null) storedValue = JSON.parse(raw)
      storageVersion = window.localStorage.getItem(`${storageKey}:version`)
    } catch {
      // 손상된 저장값은 무시하고 기본 접힘 상태를 사용한다.
    }

    setCollapseState({
      workspaceId,
      pageIds: resolveInitialCollapsedPageIds(
        pages,
        collapseFromDepth,
        storedValue,
        storageVersion,
      ),
      hydrated: true,
    })
  }, [collapseFromDepth, collapseState.hydrated, collapseState.workspaceId, pages, pagesReady, storagePrefix, workspaceId])

  useEffect(() => {
    if (
      !workspaceId ||
      !pagesReady ||
      !collapseState.hydrated ||
      collapseState.workspaceId !== workspaceId
    ) return

    try {
      const storageKey = `${storagePrefix}${workspaceId}`
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([...collapseState.pageIds])
      )
      window.localStorage.setItem(`${storageKey}:version`, '2')
    } catch {
      // 용량 초과 등 저장 실패는 화면 동작에 영향을 주지 않도록 무시한다.
    }
  }, [collapseState, pagesReady, storagePrefix, workspaceId])

  const updateCollapsedPageIds = useCallback((update: (previous: Set<string>) => Set<string>) => {
    setCollapseState(previous => {
      if (!previous.hydrated || previous.workspaceId !== workspaceId) return previous
      const pageIds = update(previous.pageIds)
      return pageIds === previous.pageIds ? previous : { ...previous, pageIds }
    })
  }, [workspaceId])

  const togglePage = useCallback((pageId: string) => {
    updateCollapsedPageIds(previous => {
      const next = new Set(previous)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }, [updateCollapsedPageIds])

  const expandPage = useCallback((pageId: string) => {
    updateCollapsedPageIds(previous => {
      if (!previous.has(pageId)) return previous
      const next = new Set(previous)
      next.delete(pageId)
      return next
    })
  }, [updateCollapsedPageIds])

  const revealAncestors = useCallback((pageId: string) => {
    const pagesById = new Map(pages.map(page => [page.id, page]))
    const ancestorIds: string[] = []
    const visited = new Set<string>()
    let currentId = pagesById.get(pageId)?.parent_id ?? null

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      ancestorIds.push(currentId)
      currentId = pagesById.get(currentId)?.parent_id ?? null
    }

    if (ancestorIds.length === 0) return
    updateCollapsedPageIds(previous => {
      if (!ancestorIds.some(id => previous.has(id))) return previous
      const next = new Set(previous)
      for (const id of ancestorIds) next.delete(id)
      return next
    })
  }, [pages, updateCollapsedPageIds])

  const collapsedPageIds = collapseState.workspaceId === workspaceId
    ? collapseState.pageIds
    : new Set<string>()

  return { collapsedPageIds, togglePage, expandPage, revealAncestors }
}
