'use client'

import { useEffect, useState } from 'react'
import { markdownToTiptap, tiptapToMarkdown } from '../lib/markdown-content'
import DocumentEditor from './document-editor'

interface MarkdownEditorProps {
  pageId: string
  content: Record<string, unknown> | null
  editable: boolean
  onChange: (content: Record<string, unknown>) => void
}

export default function MarkdownEditor({ pageId, content, editable, onChange }: MarkdownEditorProps) {
  const [draft, setDraft] = useState(() => tiptapToMarkdown(content))
  const [previewContent, setPreviewContent] = useState<Record<string, unknown> | null>(content)

  useEffect(() => {
    setDraft(tiptapToMarkdown(content))
    setPreviewContent(content)
  }, [pageId])

  return (
    <div className="grid min-h-[55vh] grid-cols-2 gap-4 max-lg:grid-cols-1">
      <section className="flex min-h-[55vh] flex-col border border-black bg-[#50504d]">
        <div className="border-b border-black bg-[#62625f] px-3 py-2 text-xs font-black uppercase text-white">
          Markdown
        </div>
        <textarea
          className="min-h-0 flex-1 resize-none bg-[#50504d] p-4 font-mono text-sm font-semibold leading-7 text-white outline-none placeholder:text-neutral-300"
          value={draft}
          disabled={!editable}
          placeholder="# 제목&#10;&#10;- 정리할 내용&#10;- 액션 아이템&#10;&#10;> 인용문"
          onChange={event => {
            const value = event.target.value
            const nextContent = markdownToTiptap(value)
            setDraft(value)
            setPreviewContent(nextContent)
            onChange(nextContent)
          }}
        />
      </section>

      <section className="min-h-[55vh] border border-black bg-[#50504d]">
        <div className="border-b border-black bg-[#62625f] px-3 py-2 text-xs font-black uppercase text-white">
          Preview
        </div>
        <div className="p-4">
          <DocumentEditor content={previewContent} editable={false} onChange={() => undefined} />
        </div>
      </section>
    </div>
  )
}
