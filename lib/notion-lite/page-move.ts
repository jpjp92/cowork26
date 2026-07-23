import type { PageDropPosition, PageRecord } from './types'

export interface PageMoveResult {
  pages: PageRecord[]
  changed: PageRecord[]
  expandPageId: string | null
}

export function planPageMove(
  pages: PageRecord[],
  draggedId: string,
  targetId: string,
  position: PageDropPosition,
): PageMoveResult | null {
  if (draggedId === targetId) return null

  const draggedPage = pages.find(page => page.id === draggedId)
  const targetPage = pages.find(page => page.id === targetId)
  if (!draggedPage || !targetPage) return null

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
  if (nextParentId === draggedId || (nextParentId && isDescendantOf(nextParentId, draggedId))) {
    return null
  }

  const byParent = new Map<string, PageRecord[]>()
  for (const page of pages) {
    if (page.id === draggedId) continue
    const key = page.parent_id ?? 'root'
    const siblings = byParent.get(key)
    if (siblings) siblings.push(page)
    else byParent.set(key, [page])
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
  }

  const nextParentKey = nextParentId ?? 'root'
  const targetSiblings = [...(byParent.get(nextParentKey) ?? [])]
  const movedPage = { ...draggedPage, parent_id: nextParentId }

  if (position === 'inside') {
    targetSiblings.push(movedPage)
  } else {
    const targetIndex = targetSiblings.findIndex(page => page.id === targetId)
    if (targetIndex < 0) return null
    targetSiblings.splice(position === 'above' ? targetIndex : targetIndex + 1, 0, movedPage)
  }
  byParent.set(nextParentKey, targetSiblings)

  const touchedParentKeys = new Set([draggedPage.parent_id ?? 'root', nextParentKey])
  const updates = new Map<string, PageRecord>()
  for (const parentKey of touchedParentKeys) {
    const siblings = byParent.get(parentKey) ?? []
    siblings.forEach((page, index) => {
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

  if (changed.length === 0) return null
  return {
    pages: nextPages,
    changed,
    expandPageId: position === 'inside' ? targetId : null,
  }
}
