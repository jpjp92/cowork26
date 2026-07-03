'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { searchPages, type SearchablePage, type SearchResult } from '../lib/page-search'

interface SearchModalProps {
  open: boolean
  pages: SearchablePage[]
  onClose: () => void
  onSelect: (pageId: string) => void
}

function Highlighted({ text, start, length }: { text: string; start: number; length: number }) {
  if (length <= 0 || start < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-[#baf7c8] text-black">{text.slice(start, start + length)}</mark>
      {text.slice(start + length)}
    </>
  )
}

export function SearchModal({ open, pages, onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo<SearchResult[]>(
    () => (open ? searchPages(pages, query) : []),
    [open, pages, query],
  )

  // 모달이 열릴 때마다 입력 초기화 + 포커스
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      inputRef.current?.focus()
    }
  }, [open])

  // 검색어가 바뀌면 활성 인덱스 리셋
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  const choose = (index: number) => {
    const hit = results[index]
    if (!hit) return
    onSelect(hit.id)
    onClose()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(i => Math.min(i + 1, Math.max(0, results.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-black bg-white shadow-[4px_4px_0_#000]"
        onClick={event => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-black p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="페이지 제목·내용 검색"
            className="h-9 w-full border border-black bg-white px-3 text-sm font-bold text-black outline-none placeholder:text-[#555]"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm font-bold text-[#555]">
              {query.trim() ? '검색 결과가 없습니다.' : '검색어를 입력하세요.'}
            </li>
          ) : (
            results.map((hit, index) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(index)}
                  className={`block w-full px-4 py-2 text-left ${index === activeIndex ? 'bg-[#baf7c8] text-black' : 'bg-white text-black'}`}
                >
                  <p className="truncate text-sm font-black">
                    {hit.titleMatch
                      ? <Highlighted text={hit.title} start={hit.matchStart} length={hit.matchLength} />
                      : hit.title}
                  </p>
                  {!hit.titleMatch && (
                    <p className="truncate text-xs text-[#333]">
                      <Highlighted text={hit.snippet} start={hit.matchStart} length={hit.matchLength} />
                    </p>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
