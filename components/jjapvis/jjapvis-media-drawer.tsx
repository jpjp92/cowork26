'use client'

// 짭비스 생성 이미지, 동영상, 오디오, 차트를 실시간 표출하는 우측 사이드 미디어 갤러리 드로어 컴포넌트임
import { useState } from 'react'
import type { JjapvisMediaItem } from '../../lib/jjapvis/types'
import { JJAPVIS_CONFIG } from '../../lib/jjapvis/config'

interface JjapvisMediaDrawerProps {
  isOpen: boolean
  mediaList: JjapvisMediaItem[]
  onClose: () => void
  onClear: () => void
}

// 상대 미디어 경로를 백엔드 절대 URL로 변환함
function toAbsoluteMediaUrl(url: string): string {
  if (!url) return ''
  const u = String(url).trim().replace(/\\/g, '/')
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:') || u.startsWith('blob:')) {
    return u
  }
  const sUrl = JJAPVIS_CONFIG.serverUrl.replace(/\/+$/, '')
  const low = u.toLowerCase()
  if (low.indexOf('outputs/') !== -1) return `${sUrl}/${u.slice(low.indexOf('outputs/'))}`
  if (low.indexOf('uploads/') !== -1) return `${sUrl}/${u.slice(low.indexOf('uploads/'))}`
  if (/^[A-Za-z]:\//.test(u)) {
    const fname = u.split('/').pop() || ''
    return `${sUrl}/media/${encodeURIComponent(fname)}`
  }
  return u.startsWith('/') ? `${sUrl}${u}` : `${sUrl}/${u}`
}

export function JjapvisMediaDrawer({
  isOpen,
  mediaList,
  onClose,
  onClear,
}: JjapvisMediaDrawerProps) {
  const [selectedMedia, setSelectedMedia] = useState<JjapvisMediaItem | null>(null)

  if (!isOpen) return null

  // 미디어 파일 다운로드 핸들러임
  const handleDownload = (item: JjapvisMediaItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const url = toAbsoluteMediaUrl(item.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `jjapvis_${item.type}_${Date.now()}`
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 새 탭에서 열기 핸들러임
  const handleOpenNewTab = (item: JjapvisMediaItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const url = toAbsoluteMediaUrl(item.data)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="w-80 sm:w-96 h-full bg-[#070c16] border-l border-[#1f293d] flex flex-col font-mono text-xs select-none z-20 shadow-[-4px_0_12px_rgba(0,0,0,0.5)]">
        {/* 드로어 헤더임 */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#0c1322] border-b border-[#1f293d] text-[#5eead4]">
          <div className="flex items-center space-x-2">
            <span className="text-[#38bdf8] font-bold">🖼️ 미디어 갤러리</span>
            <span className="px-1.5 py-0.2 rounded-full bg-[#1e293b] text-[10px] text-[#93c5fd] font-bold">
              {mediaList.length}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {mediaList.length > 0 && (
              <button
                onClick={onClear}
                className="text-[10px] text-slate-400 hover:text-red-400 transition-colors"
                title="갤러리 비우기"
              >
                비우기
              </button>
            )}
            <button
              onClick={onClose}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold"
              title="패널 닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 미디어 목록 스크롤 영역임 */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
          {mediaList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-16 px-4">
              <span className="text-3xl mb-2 opacity-50">📂</span>
              <p className="text-xs font-semibold text-slate-400">생성된 미디어가 없음</p>
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                짭비스가 생성한 이미지, 동영상, 차트, 음원이 여기에 자동으로 보관됨.
              </p>
            </div>
          ) : (
            mediaList.map((item) => {
              const absUrl = toAbsoluteMediaUrl(item.data)
              const timeStr = new Date(item.timestamp).toTimeString().slice(0, 8)
              const isBg = item.is_background

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedMedia(item)}
                  className={`group relative rounded-lg border overflow-hidden bg-[#0a101d] transition-all hover:border-[#38bdf8] hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] cursor-pointer ${
                    isBg
                      ? 'border-[#c026d3]/40 shadow-[0_0_8px_rgba(192,38,211,0.15)]'
                      : 'border-[#1e293b]'
                  }`}
                >
                  {/* 미디어 카드 상단 정보 바임 */}
                  <div className="flex items-center justify-between px-2 py-1 bg-[#0f172a] border-b border-[#1e293b] text-[10px]">
                    <span
                      className={`font-bold uppercase ${
                        isBg ? 'text-[#f0abfc]' : 'text-[#38bdf8]'
                      }`}
                    >
                      {isBg ? `⚙️ ${item.bg_name || '백그라운드'}` : item.type}
                    </span>
                    <div className="flex items-center space-x-1.5 text-slate-400">
                      <span>{timeStr}</span>
                      <button
                        onClick={(e) => handleOpenNewTab(item, e)}
                        className="hover:text-white transition-colors"
                        title="새 창에서 열기"
                      >
                        ⤢
                      </button>
                      <button
                        onClick={(e) => handleDownload(item, e)}
                        className="hover:text-white transition-colors"
                        title="다운로드"
                      >
                        ⬇
                      </button>
                    </div>
                  </div>

                  {/* 미디어 본체 렌더링임 */}
                  <div className="relative bg-black flex items-center justify-center overflow-hidden min-h-[140px] max-h-[240px]">
                    {item.type === 'video' ? (
                      <video
                        src={absUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full max-h-[220px] object-contain"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : item.type === 'audio' ? (
                      <div className="w-full p-3 bg-[#0a101f]">
                        <div className="text-[11px] text-cyan-300 font-bold mb-1 truncate">
                          🎵 {item.caption || 'AI 음원 / 오디오'}
                        </div>
                        <audio
                          src={absUrl}
                          controls
                          className="w-full h-8 mt-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : item.data.toLowerCase().startsWith('<svg') ? (
                      <div
                        className="p-3 w-full flex items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: item.data }}
                      />
                    ) : (
                      <img
                        src={absUrl}
                        alt={item.caption || '짭비스 미디어'}
                        className="w-full h-auto max-h-[240px] object-cover hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    )}
                  </div>

                  {/* 캡션 표시 영역임 */}
                  {item.caption && (
                    <div className="px-2.5 py-1.5 bg-[#0a101d] text-[11px] text-slate-300 leading-snug border-t border-[#1e293b] line-clamp-2">
                      {item.caption}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 대형 원본 라이트박스 뷰어 모달임 */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 select-none"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-[#090e17] border border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.3)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 뷰어 상단 헤더임 */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0f172a] border-b border-[#1e293b] text-cyan-300 font-mono text-xs">
              <span className="font-bold truncate max-w-md">
                {selectedMedia.caption || '미디어 상세 보기'}
              </span>
              <div className="flex items-center space-x-3">
                <button
                  onClick={(e) => handleOpenNewTab(selectedMedia, e)}
                  className="hover:text-white transition-colors"
                  title="새 창에서 원본 열기"
                >
                  새 창 ⤢
                </button>
                <button
                  onClick={(e) => handleDownload(selectedMedia, e)}
                  className="hover:text-white transition-colors"
                  title="다운로드"
                >
                  다운로드 ⬇
                </button>
                <button
                  onClick={() => setSelectedMedia(null)}
                  className="text-slate-400 hover:text-red-400 font-bold text-sm"
                  title="닫기 (ESC)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 원본 렌더링 컨테이너임 */}
            <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-black">
              {selectedMedia.type === 'video' ? (
                <video
                  src={toAbsoluteMediaUrl(selectedMedia.data)}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              ) : selectedMedia.type === 'audio' ? (
                <div className="p-8 bg-[#0a101f] rounded-lg text-center">
                  <span className="text-4xl">🎵</span>
                  <p className="text-sm font-bold text-cyan-300 mt-3 mb-4">
                    {selectedMedia.caption || 'AI 오디오 / 음원'}
                  </p>
                  <audio
                    src={toAbsoluteMediaUrl(selectedMedia.data)}
                    controls
                    autoPlay
                    className="w-80"
                  />
                </div>
              ) : selectedMedia.data.toLowerCase().startsWith('<svg') ? (
                <div
                  className="p-6 bg-slate-900 rounded-lg max-w-full"
                  dangerouslySetInnerHTML={{ __html: selectedMedia.data }}
                />
              ) : (
                <img
                  src={toAbsoluteMediaUrl(selectedMedia.data)}
                  alt={selectedMedia.caption || '상세 이미지'}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
