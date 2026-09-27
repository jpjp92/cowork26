'use client'

import type { WorkspaceAnalysisResult } from '../../lib/notion-lite/types'
import { UtilityPanel } from './utility-panel'

export function WorkspaceAnalysisResultDialog({
  open,
  loading,
  result,
  error,
  onCancel,
  onBack,
  onClose,
  onOpenPage,
}: {
  open: boolean
  loading: boolean
  result: WorkspaceAnalysisResult | null
  error: string
  onCancel: () => void
  onBack: () => void
  onClose: () => void
  onOpenPage: (pageId: string) => void
}) {
  if (!open) return null
  return (
    <UtilityPanel
      id="workspace-analysis-result-panel"
      title="✦ AI 분석"
      description={result ? '닫아도 이번 결과는 AI 분석 메뉴에 유지됩니다.' : '결과는 페이지에 자동 저장되지 않습니다.'}
      closeLabel="분석 결과 닫기"
      onClose={loading ? onCancel : onClose}
      footer={loading ? (
        <button type="button" onClick={onCancel} className="min-h-11 w-full rounded-[8px] border border-black bg-white px-3 text-xs font-black">분석 취소</button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onBack} className="min-h-11 rounded-[8px] border border-black bg-[#c4b5fd] px-3 text-xs font-black">← {error ? '다시 선택' : '새 분석'}</button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-[8px] border border-black bg-white px-3 text-xs font-black">닫기</button>
        </div>
      )}
    >
          {loading && <div className="rounded-[8px] border border-black bg-[#c4b5fd] p-4">
            <p className="flex items-center justify-center text-center text-sm font-black">
              <span>문서를 분석하고 있습니다</span>
              <span aria-hidden="true" className="loading-dots ml-1 inline-flex w-5 justify-between">
                <span>·</span><span>·</span><span>·</span>
              </span>
            </p>
            <p className="mt-1 text-center text-[11px] font-medium text-[#454047]">정확하지 않은 예상 시간이나 퍼센트는 표시하지 않습니다.</p>
            <ol className="mt-4 space-y-2 text-xs font-bold">
              <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full border border-black bg-[#baf7c8] text-[10px]">✓</span>권한 및 정책 확인</li>
              <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full border border-black bg-[#baf7c8] text-[10px]">✓</span>최신 문서 수집</li>
              <li className="flex items-center gap-2"><span aria-hidden="true" className="grid h-5 w-5 animate-pulse place-items-center rounded-full border border-black bg-white text-[10px] motion-reduce:animate-none">✦</span>AI 분석 중</li>
              <li className="flex items-center gap-2 text-[#6b6470]"><span className="h-5 w-5 rounded-full border border-black bg-[#ddd8e4]" />결과 검증</li>
            </ol>
          </div>}
          {error && <div className="rounded-[8px] border border-black bg-red-200 p-4"><p className="text-sm font-black">분석하지 못했습니다.</p><p className="mt-1 text-xs font-medium">{error}</p></div>}
          {result && <div>
            <div className="rounded-[8px] border border-black bg-white p-4"><p className="text-[10px] font-black uppercase text-[#666]">{result.provider}</p><h3 className="mt-1 text-xl font-black">{result.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{result.overview}</p></div>
            {result.sections.map((section, index) => <section key={`${section.kind}-${index}`} className="mt-3 rounded-[8px] border border-black bg-white p-4"><h4 className="text-sm font-black">{section.heading}</h4><ul className="mt-2 space-y-2">{section.items.map((item, itemIndex) => <li key={itemIndex} className="text-sm"><p className="whitespace-pre-wrap">{item.text}</p>{item.citations.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{item.citations.map(citation => <button key={citation.label} type="button" onClick={() => onOpenPage(citation.pageId)} className="rounded border border-black bg-[#baf7c8] px-1.5 py-0.5 text-[10px] font-black">{citation.label}</button>)}</div>}</li>)}</ul></section>)}
            {result.unknowns.length > 0 && <section className="mt-3 rounded-[8px] border border-black bg-[#fde68a] p-4"><h4 className="text-sm font-black">확인할 사항</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{result.unknowns.map((item, index) => <li key={index}>{item.text}</li>)}</ul></section>}
          </div>}
    </UtilityPanel>
  )
}
