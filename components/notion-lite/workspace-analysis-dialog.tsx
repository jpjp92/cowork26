'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  MAX_ANALYSIS_ADDITIONAL_REQUEST_CHARS,
  MAX_ANALYSIS_PAGES,
  MAX_ANALYSIS_SOURCE_BYTES,
} from '../../lib/ai/analysis-limits'
import { collectPageAndDescendantIds } from '../../lib/notion-lite/page-tree'
import type {
  PageRecord,
  WorkspaceAnalysisDraft,
  WorkspaceAnalysisMode,
} from '../../lib/notion-lite/types'
import { tiptapToPlainText } from '../../lib/tiptap-to-plaintext'
import { UtilityPanel } from './utility-panel'

const MODES: Array<{ id: WorkspaceAnalysisMode; label: string; description: string }> = [
  { id: 'summary', label: '요약', description: '개요와 핵심 사항' },
  { id: 'organize', label: '정리', description: '주제별 묶음과 중복 제거' },
  { id: 'analysis', label: '분석', description: '차이·모순·위험 검토' },
  { id: 'question', label: '질문', description: '문서 근거 답변' },
  { id: 'action_items', label: '액션 아이템', description: '할 일과 담당 후보' },
]

function estimatedPageBytes(page: PageRecord) {
  const text = `${page.title}\n\n${tiptapToPlainText(page.content) || '(본문 없음)'}`
  return new TextEncoder().encode(text).byteLength
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KiB`
}

export function WorkspaceAnalysisDialog({
  open,
  workspaceId,
  pages,
  currentPageId,
  initialDraft,
  onClose,
  onConfirm,
}: {
  open: boolean
  workspaceId: string
  pages: PageRecord[]
  currentPageId: string
  initialDraft: WorkspaceAnalysisDraft | null
  onClose: () => void
  onConfirm: (draft: WorkspaceAnalysisDraft) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<WorkspaceAnalysisMode>('summary')
  const [provider, setProvider] = useState<'openai' | 'gemini'>('openai')
  const [additionalRequest, setAdditionalRequest] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const reusableDraft = initialDraft?.workspaceId === workspaceId ? initialDraft : null
    setSelectedIds(new Set(reusableDraft?.pageIds.length ? reusableDraft.pageIds : [currentPageId]))
    setMode(reusableDraft?.mode ?? 'summary')
    setProvider(reusableDraft?.provider ?? 'openai')
    setAdditionalRequest(reusableDraft?.additionalRequest ?? '')
    setQuery('')
  }, [currentPageId, initialDraft, open, workspaceId])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  const selectedPages = useMemo(
    () => pages.filter(page => selectedIds.has(page.id)),
    [pages, selectedIds],
  )
  const estimatedBytes = useMemo(
    () => selectedPages.reduce((total, page) => total + estimatedPageBytes(page), 0),
    [selectedPages],
  )
  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR')
    return normalized
      ? pages.filter(page => page.title.toLocaleLowerCase('ko-KR').includes(normalized))
      : pages
  }, [pages, query])
  const overCount = selectedIds.size > MAX_ANALYSIS_PAGES
  const overBytes = estimatedBytes > MAX_ANALYSIS_SOURCE_BYTES
  const canConfirm = selectedIds.size > 0 && !overCount && !overBytes

  if (!open) return null

  const selectCurrent = () => setSelectedIds(new Set([currentPageId]))
  const selectDescendants = () => setSelectedIds(collectPageAndDescendantIds(currentPageId, pages))
  const togglePage = (pageId: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }

  return (
    <UtilityPanel
      id="workspace-analysis-panel"
      title="✦ AI 분석"
      description="실행 전에 외부 전송 대상을 확인합니다."
      closeLabel="분석 준비 닫기"
      onClose={onClose}
      footer={<div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-[8px] border border-black bg-white px-3 text-xs font-black">닫기</button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm({
            workspaceId,
            pageIds: selectedPages.map(page => page.id),
            provider,
            mode,
            additionalRequest: additionalRequest.trim(),
          })}
          className="min-h-11 rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black shadow-[2px_2px_0_#000] disabled:cursor-not-allowed disabled:opacity-40"
        >분석 시작</button>
      </div>}
    >
          <section aria-labelledby="analysis-scope-heading">
            <h3 id="analysis-scope-heading" className="text-xs font-black uppercase">1. 분석할 페이지</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={selectCurrent} className="min-h-11 rounded-[8px] border border-black bg-[#baf7c8] px-2 text-xs font-black shadow-[2px_2px_0_#000]">현재 페이지만</button>
              <button type="button" onClick={selectDescendants} className="min-h-11 rounded-[8px] border border-black bg-[#fde68a] px-2 text-xs font-black shadow-[2px_2px_0_#000]">현재 + 하위 페이지</button>
            </div>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="워크스페이스 페이지 검색"
              className="mt-3 h-11 w-full rounded-[8px] border border-black bg-white px-3 text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#baf7c8] sm:h-9 sm:text-sm"
            />
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-[8px] border border-black bg-white p-1.5">
              {filteredPages.map(page => (
                <label key={page.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-[6px] px-2 hover:bg-[#f1eee5]">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(page.id)}
                    onChange={() => togglePage(page.id)}
                    className="h-5 w-5 shrink-0 accent-[#50504d]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{page.title || 'Untitled'}</span>
                  {page.id === currentPageId && <span className="shrink-0 text-[10px] font-black text-[#555]">현재</span>}
                </label>
              ))}
              {filteredPages.length === 0 && <p className="px-2 py-4 text-center text-xs font-bold text-[#666]">검색 결과가 없습니다.</p>}
            </div>
            <div className={`mt-2 rounded-[6px] border border-black px-2.5 py-2 text-xs font-bold ${overCount || overBytes ? 'bg-red-200' : 'bg-[#d9f5df]'}`}>
              선택 {selectedIds.size}/{MAX_ANALYSIS_PAGES} · 예상 {formatBytes(estimatedBytes)}/{formatBytes(MAX_ANALYSIS_SOURCE_BYTES)}
              {(overCount || overBytes) && <p className="mt-1">제한을 넘는 페이지를 선택 해제해 주세요.</p>}
            </div>
          </section>

          <section aria-labelledby="analysis-mode-heading" className="mt-4 border-t border-black pt-3">
            <h3 id="analysis-mode-heading" className="text-xs font-black uppercase">2. 분석 방식</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={mode === item.id}
                  onClick={() => setMode(item.id)}
                className={`min-h-12 rounded-[8px] border border-black p-2 text-left shadow-[2px_2px_0_#000] ${mode === item.id ? 'bg-[#c4b5fd]' : 'bg-white'}`}
                >
                  <span className="block text-xs font-black">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] font-medium text-[#555]">{item.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="analysis-provider-heading" className="mt-4 border-t border-black pt-3">
            <h3 id="analysis-provider-heading" className="text-xs font-black uppercase">3. AI 제공자</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={provider === 'openai'} onClick={() => setProvider('openai')} className={`min-h-11 rounded-[8px] border border-black px-3 text-xs font-black shadow-[2px_2px_0_#000] ${provider === 'openai' ? 'bg-[#baf7c8]' : 'bg-white'}`}>OpenAI</button>
              <button type="button" aria-pressed={provider === 'gemini'} onClick={() => setProvider('gemini')} className={`min-h-11 rounded-[8px] border border-black px-3 text-xs font-black shadow-[2px_2px_0_#000] ${provider === 'gemini' ? 'bg-[#c4b5fd]' : 'bg-white'}`}>Gemini</button>
            </div>
          </section>

          <section aria-labelledby="analysis-request-heading" className="mt-4 border-t border-black pt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id="analysis-request-heading" className="text-xs font-black uppercase">4. 추가 요청</h3>
              <span className="text-[10px] font-bold text-[#666]">{additionalRequest.length}/{MAX_ANALYSIS_ADDITIONAL_REQUEST_CHARS}</span>
            </div>
            <textarea
              value={additionalRequest}
              maxLength={MAX_ANALYSIS_ADDITIONAL_REQUEST_CHARS}
              onChange={event => setAdditionalRequest(event.target.value)}
              placeholder="예: 결정 사항과 미해결 쟁점을 강조해줘"
              rows={2}
              className="mt-2 w-full resize-y rounded-[8px] border border-black bg-white p-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#c4b5fd] sm:text-sm"
            />
          </section>

          <section aria-labelledby="analysis-final-heading" className="mt-4 border-t border-black pt-3">
            <h3 id="analysis-final-heading" className="text-xs font-black uppercase">5. 분석에 포함할 페이지</h3>
            <ol className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-[8px] border border-black bg-[#50504d] p-2 text-white">
              {selectedPages.map((page, index) => (
                <li key={page.id} className="flex gap-2 rounded-[5px] bg-[#62625f] px-2 py-1.5 text-xs font-bold">
                  <span className="shrink-0 text-[#baf7c8]">S{index + 1}</span>
                  <span className="min-w-0 truncate">{page.title || 'Untitled'}</span>
                </li>
              ))}
              {selectedPages.length === 0 && <li className="px-2 py-2 text-xs text-neutral-200">선택된 페이지가 없습니다.</li>}
            </ol>
            <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#555]">
              아래 목록은 결과 파일이 아니라 AI에 전달할 근거 문서입니다. 결과는 별도 화면에 표시되며 페이지 생성이나 다운로드는 자동으로 하지 않습니다.
            </p>
          </section>
    </UtilityPanel>
  )
}
