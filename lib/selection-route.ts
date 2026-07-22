export interface SelectionRoute {
  kind: 'root' | 'workspace' | 'page' | 'legacy-page' | 'unknown'
  workspaceId: string
  pageId: string
}

const UNKNOWN_ROUTE: SelectionRoute = {
  kind: 'unknown',
  workspaceId: '',
  pageId: '',
}

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function getSelectionPath(workspaceId: string, pageId?: string) {
  if (workspaceId && pageId) return `/p/${encodeURIComponent(pageId)}`
  if (workspaceId) return `/w/${encodeURIComponent(workspaceId)}`
  return '/'
}

export function readSelectionFromPath(pathname: string): SelectionRoute {
  if (pathname === '/') {
    return { kind: 'root', workspaceId: '', pageId: '' }
  }

  const legacyPageMatch = pathname.match(/^\/w\/([^/]+)\/p\/([^/]+)\/?$/)
  if (legacyPageMatch) {
    const workspaceId = decodeSegment(legacyPageMatch[1])
    const pageId = decodeSegment(legacyPageMatch[2])
    if (workspaceId === null || pageId === null) return UNKNOWN_ROUTE
    return { kind: 'legacy-page', workspaceId, pageId }
  }

  const workspaceMatch = pathname.match(/^\/w\/([^/]+)\/?$/)
  if (workspaceMatch) {
    const workspaceId = decodeSegment(workspaceMatch[1])
    if (workspaceId === null) return UNKNOWN_ROUTE
    return { kind: 'workspace', workspaceId, pageId: '' }
  }

  const pageMatch = pathname.match(/^\/p\/([^/]+)\/?$/)
  if (pageMatch) {
    const pageId = decodeSegment(pageMatch[1])
    if (pageId === null) return UNKNOWN_ROUTE
    return { kind: 'page', workspaceId: '', pageId }
  }

  return UNKNOWN_ROUTE
}
