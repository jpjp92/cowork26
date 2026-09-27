import 'server-only'

import { isUuid } from '../image-assets'
import { supabaseAdmin } from '../supabase-admin'
import { tiptapToPlainText } from '../tiptap-to-plaintext'
import type { PromptSource } from './prompt-builder'
import { MAX_ANALYSIS_PAGES, MAX_ANALYSIS_SOURCE_BYTES } from './analysis-limits'

export { MAX_ANALYSIS_PAGES, MAX_ANALYSIS_SOURCE_BYTES } from './analysis-limits'

type PageSourceRow = {
  id: string
  workspace_id: string
  title: string
  content: Record<string, unknown> | null
  content_revision: number
}

export type AnalysisSourceMetadata = {
  label: string
  pageId: string
  contentRevision: number
  normalizedBytes: number
}

export type VerifiedDocumentSources = {
  providerSources: PromptSource[]
  metadata: AnalysisSourceMetadata[]
  totalBytes: number
}

export class DocumentSourceError extends Error {
  readonly code: 'INVALID_SOURCE_REQUEST' | 'FORBIDDEN' | 'SOURCE_NOT_FOUND' | 'SOURCE_TOO_LARGE'

  constructor(code: DocumentSourceError['code']) {
    super(code)
    this.name = 'DocumentSourceError'
    this.code = code
  }
}

function normalizeText(value: string) {
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
}

function validateSourceRequest(workspaceId: string, requestedPageIds: readonly string[]) {
  if (!isUuid(workspaceId) || requestedPageIds.length === 0 || requestedPageIds.length > MAX_ANALYSIS_PAGES) {
    throw new DocumentSourceError('INVALID_SOURCE_REQUEST')
  }
  if (new Set(requestedPageIds).size !== requestedPageIds.length || requestedPageIds.some(id => !isUuid(id))) {
    throw new DocumentSourceError('INVALID_SOURCE_REQUEST')
  }
}

export function normalizeVerifiedPageRows(
  workspaceId: string,
  requestedPageIds: readonly string[],
  rows: readonly PageSourceRow[],
): VerifiedDocumentSources {
  validateSourceRequest(workspaceId, requestedPageIds)

  const rowsById = new Map(rows.map(row => [row.id, row]))
  let totalBytes = 0
  const providerSources: PromptSource[] = []
  const metadata: AnalysisSourceMetadata[] = []

  requestedPageIds.forEach((pageId, index) => {
    const row = rowsById.get(pageId)
    if (!row || row.workspace_id !== workspaceId) throw new DocumentSourceError('SOURCE_NOT_FOUND')
    if (!Number.isSafeInteger(row.content_revision) || row.content_revision < 0) {
      throw new DocumentSourceError('INVALID_SOURCE_REQUEST')
    }
    const title = normalizeText(row.title) || 'Untitled'
    const content = normalizeText(tiptapToPlainText(row.content)) || '(본문 없음)'
    const normalizedBytes = Buffer.byteLength(`${title}\n\n${content}`, 'utf8')
    totalBytes += normalizedBytes
    if (totalBytes > MAX_ANALYSIS_SOURCE_BYTES) throw new DocumentSourceError('SOURCE_TOO_LARGE')
    const label = `S${index + 1}`

    providerSources.push({ label, revision: row.content_revision, title, content })
    metadata.push({ label, pageId, contentRevision: row.content_revision, normalizedBytes })
  })

  return { providerSources, metadata, totalBytes }
}

export async function loadVerifiedDocumentSources(input: {
  workspaceId: string
  userId: string
  pageIds: readonly string[]
}): Promise<VerifiedDocumentSources> {
  if (!isUuid(input.userId)) throw new DocumentSourceError('INVALID_SOURCE_REQUEST')
  // Validate shape before issuing a service-role query.
  validateSourceRequest(input.workspaceId, input.pageIds)

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (membershipError) throw new Error('Analysis membership lookup failed.')
  if (!membership) throw new DocumentSourceError('FORBIDDEN')

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('pages')
    .select('id, workspace_id, title, content, content_revision')
    .eq('workspace_id', input.workspaceId)
    .in('id', [...input.pageIds])
  if (pagesError) throw new Error('Analysis source lookup failed.')

  return normalizeVerifiedPageRows(input.workspaceId, input.pageIds, pages ?? [])
}
