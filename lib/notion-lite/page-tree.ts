import type { PageRecord } from './types'

const ROOT_KEY = 'root'

export function buildPageTree(pages: PageRecord[]) {
  const byParent = new Map<string, PageRecord[]>()

  for (const page of pages) {
    const key = page.parent_id ?? ROOT_KEY
    const siblings = byParent.get(key)
    if (siblings) siblings.push(page)
    else byParent.set(key, [page])
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
  }

  return byParent
}

export function getPageTrail(pageId: string, pages: PageRecord[]) {
  const pagesById = new Map(pages.map(page => [page.id, page]))
  const trail: PageRecord[] = []
  const visited = new Set<string>()
  let currentPage = pagesById.get(pageId)

  while (currentPage && !visited.has(currentPage.id)) {
    visited.add(currentPage.id)
    trail.unshift(currentPage)
    currentPage = currentPage.parent_id ? pagesById.get(currentPage.parent_id) : undefined
  }

  return trail
}

export function collectPageAndDescendantIds(pageId: string, pages: PageRecord[]) {
  const collected = new Set([pageId])
  let changed = true

  while (changed) {
    changed = false
    for (const page of pages) {
      if (page.parent_id && collected.has(page.parent_id) && !collected.has(page.id)) {
        collected.add(page.id)
        changed = true
      }
    }
  }

  return collected
}

export function getDefaultCollapsedPageIds(pages: PageRecord[], collapseFromDepth: number) {
  const parentById = new Map(pages.map(page => [page.id, page.parent_id]))
  const hasChildren = new Set(pages.map(page => page.parent_id).filter((id): id is string => Boolean(id)))
  const collapsed = new Set<string>()

  const getDepth = (pageId: string) => {
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

  for (const page of pages) {
    if (hasChildren.has(page.id) && getDepth(page.id) >= collapseFromDepth) {
      collapsed.add(page.id)
    }
  }

  return collapsed
}

export function resolveInitialCollapsedPageIds(
  pages: PageRecord[],
  collapseFromDepth: number,
  storedValue: unknown,
  storageVersion: string | null,
) {
  if (!Array.isArray(storedValue)) {
    return getDefaultCollapsedPageIds(pages, collapseFromDepth)
  }

  // v2 이전의 빈 배열은 초기화 순서 버그로 저장됐을 수 있어 한 번만 기본값으로 복구한다.
  if (storedValue.length === 0 && storageVersion !== '2') {
    return getDefaultCollapsedPageIds(pages, collapseFromDepth)
  }

  const validIds = new Set(pages.map(page => page.id))
  return new Set(
    storedValue.filter((id): id is string => typeof id === 'string' && validIds.has(id))
  )
}
