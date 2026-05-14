'use client'

import { useEffect, useState } from 'react'
import { markdownToTiptap, tiptapToMarkdown } from '../lib/markdown-content'

interface MarkdownEditorProps {
  pageId: string
  content: Record<string, unknown> | null
  editable: boolean
  onChange: (content: Record<string, unknown>) => void
}

type PreviewNode = {
  type?: string
  attrs?: Record<string, unknown>
  text?: string
  content?: PreviewNode[]
}

function textFromNode(node: PreviewNode | undefined): string {
  if (!node) return ''
  if (node.text) return node.text
  return node.content?.map(textFromNode).join('') ?? ''
}

function renderInline(nodes: PreviewNode[] | undefined) {
  return nodes?.map((node, index) => {
    if (node.text) return <span key={index}>{node.text}</span>
    return <span key={index}>{textFromNode(node)}</span>
  })
}

function renderPreviewNode(node: PreviewNode, index: number) {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      if (level === 1) {
        return <h1 key={index}>{renderInline(node.content)}</h1>
      }
      if (level === 2) {
        return <h2 key={index}>{renderInline(node.content)}</h2>
      }
      return <h3 key={index}>{renderInline(node.content)}</h3>
    }
    case 'paragraph':
      return <p key={index}>{renderInline(node.content)}</p>
    case 'blockquote':
      return <blockquote key={index}>{node.content?.map(renderPreviewNode)}</blockquote>
    case 'bulletList':
      return (
        <ul key={index}>
          {node.content?.map((item, itemIndex) => (
            <li key={itemIndex}>{textFromNode(item)}</li>
          ))}
        </ul>
      )
    case 'orderedList':
      return (
        <ol key={index}>
          {node.content?.map((item, itemIndex) => (
            <li key={itemIndex}>{textFromNode(item)}</li>
          ))}
        </ol>
      )
    case 'codeBlock':
      return (
        <pre key={index}>
          <code>{textFromNode(node)}</code>
        </pre>
      )
    default:
      return textFromNode(node) ? <p key={index}>{textFromNode(node)}</p> : null
  }
}

export default function MarkdownEditor({ pageId, content, editable, onChange }: MarkdownEditorProps) {
  const [draft, setDraft] = useState(() => tiptapToMarkdown(content))
  const [previewContent, setPreviewContent] = useState<Record<string, unknown> | null>(content)
  const previewNodes = ((previewContent as PreviewNode | null)?.content ?? [])

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

      <section className="min-h-[55vh] border border-black bg-[#fef9ef] text-[#1d1c16] shadow-[4px_4px_0_#000]">
        <div className="border-b border-black bg-[#e3e2df] px-3 py-2 text-xs font-black uppercase text-[#1d1c16]">
          Preview
        </div>
        <div className="markdown-preview min-h-[calc(55vh-37px)] p-6">
          {previewNodes.length ? (
            previewNodes.map(renderPreviewNode)
          ) : (
            <p className="text-sm font-semibold text-[#747878]">Markdown preview</p>
          )}
        </div>
      </section>
    </div>
  )
}
