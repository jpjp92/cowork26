'use client'

import dynamic from 'next/dynamic'
import type {
  CloneImageSource,
  PageRecord,
  SavingStatus,
  UploadedImageAsset,
  VisibleSavingStatus,
} from '../../lib/notion-lite/types'
import { DocumentEmptyState, DocumentSkeleton } from './loading-states'

const DocumentEditor = dynamic(() => import('../document-editor'), { ssr: false })

interface DocumentPaneProps {
  error: string
  loading: boolean
  page: PageRecord | null
  content: Record<string, unknown> | null
  breadcrumbPrefix: string[]
  canEdit: boolean
  savingStatus: SavingStatus
  visibleSavingStatus: VisibleSavingStatus
  hasWorkspace: boolean
  workspaceCount: number
  pageCount: number
  onTitleChange: (pageId: string, title: string) => void
  onTitleFocus: (pageId: string, title: string) => void
  onTitleCommit: (pageId: string, title: string, currentTitle: string) => void
  onContentChange: (pageId: string, content: Record<string, unknown>) => void
  onUploadImage?: (file: File) => Promise<UploadedImageAsset>
  onCloneImage?: (source: CloneImageSource) => Promise<UploadedImageAsset>
}

export function DocumentPane({
  error,
  loading,
  page,
  content,
  breadcrumbPrefix,
  canEdit,
  savingStatus,
  visibleSavingStatus,
  hasWorkspace,
  workspaceCount,
  pageCount,
  onTitleChange,
  onTitleFocus,
  onTitleCommit,
  onContentChange,
  onUploadImage,
  onCloneImage,
}: DocumentPaneProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {error && (
        <div className="border-b border-black bg-red-300 px-6 py-3 text-sm font-bold text-black max-sm:px-4">
          <span className="font-black">처리 실패</span>
          <span className="ml-2">{error}</span>
        </div>
      )}

      {loading ? (
        <DocumentSkeleton />
      ) : page ? (
        <article className="mx-auto my-8 w-full max-w-4xl flex-1 rounded-[8px] border border-black bg-[#fef9ef] px-10 py-12 text-[#1d1c16] shadow-[6px_6px_0_#000] max-sm:mx-3 max-sm:my-3 max-sm:w-auto max-sm:px-4 max-sm:py-6 max-sm:shadow-[3px_3px_0_#000]">
          <div className="mb-4 border-b border-black pb-3">
            <div className="flex min-w-0 flex-col gap-2 text-[#1d1c16] sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                {breadcrumbPrefix.map((label, index) => (
                  <span key={`${label}-${index}`} className="hidden min-w-0 items-baseline gap-x-2 text-sm font-black text-[#6c685f] last:flex sm:flex">
                    <span className="max-w-48 truncate">{label}</span>
                    <span>/</span>
                  </span>
                ))}
                <input
                  className="min-w-0 basis-full bg-transparent text-2xl font-black leading-tight tracking-normal text-[#1d1c16] outline-none placeholder:text-[#8a867f] sm:min-w-[12rem] sm:flex-1 sm:basis-auto max-sm:text-xl"
                  value={page.title}
                  disabled={!canEdit}
                  placeholder="Untitled"
                  onChange={event => onTitleChange(page.id, event.target.value)}
                  onFocus={event => onTitleFocus(page.id, event.target.value)}
                  onBlur={event => onTitleCommit(page.id, event.target.value, page.title)}
                />
              </div>
              <span
                className={`w-16 shrink-0 self-end rounded-[8px] border border-black px-2 py-1 text-center text-[11px] font-black text-black shadow-[2px_2px_0_#000] transition-opacity ${
                  savingStatus === 'idle' ? 'pointer-events-none opacity-0' : 'opacity-100'
                } ${
                  visibleSavingStatus === 'loaded' ? 'bg-[#fde68a]' : 'bg-[#baf7c8]'
                }`}
              >
                {visibleSavingStatus === 'loaded' ? '불러옴' : '저장됨'}
              </span>
            </div>
          </div>
          <DocumentEditor
            content={content}
            editable={canEdit}
            onChange={nextContent => onContentChange(page.id, nextContent)}
            onUploadImage={onUploadImage}
            onCloneImage={onCloneImage}
          />
        </article>
      ) : (
        <DocumentEmptyState
          hasWorkspace={hasWorkspace}
          workspaceCount={workspaceCount}
          pageCount={pageCount}
        />
      )}
    </section>
  )
}
