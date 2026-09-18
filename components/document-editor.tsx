'use client'

import { Extension, InputRule, Mark, Node, mergeAttributes } from '@tiptap/core'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { DOMParser as ProseMirrorDOMParser, Fragment, Slice } from '@tiptap/pm/model'
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Link } from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import ImageExtension from '@tiptap/extension-image'
import { createLowlight, common } from 'lowlight'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'

const lowlight = createLowlight(common)

type MermaidApi = typeof import('mermaid').default

let mermaidPromise: Promise<MermaidApi> | null = null

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(module => {
    module.default.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      maxTextSize: 50000,
      secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'secure'],
    })
    return module.default
  })

  return mermaidPromise
}

// ── Mermaid block NodeView ─────────────────────────────────────────────────

function MermaidBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [svg, setSvg] = useState<string>('')
  const [renderError, setRenderError] = useState<string>('')
  const [editing, setEditing] = useState(false)
  const [draftCode, setDraftCode] = useState<string>(node.attrs.code as string)
  const savedCodeRef = useRef<string>(node.attrs.code as string)

  // Re-render diagram when code attribute changes
  useEffect(() => {
    const code = node.attrs.code as string
    if (!code.trim()) { setSvg(''); setRenderError(''); return }
    let cancelled = false
    const id = `mg${Math.random().toString(36).slice(2, 10)}`
    loadMermaid()
      .then(mermaid => mermaid.render(id, code))
      .then(({ svg: out }) => { if (!cancelled) { setSvg(out); setRenderError('') } })
      .catch((err: unknown) => {
        if (!cancelled) { setRenderError(err instanceof Error ? err.message : '다이어그램 오류'); setSvg('') }
      })
    return () => { cancelled = true }
  }, [node.attrs.code])

  // Keep draftCode in sync when attrs change externally (e.g. other user)
  useEffect(() => {
    if (!editing) {
      setDraftCode(node.attrs.code as string)
      savedCodeRef.current = node.attrs.code as string
    }
  }, [node.attrs.code, editing])

  const handleSave = useCallback(() => {
    updateAttributes({ code: draftCode })
    savedCodeRef.current = draftCode
    setEditing(false)
  }, [draftCode, updateAttributes])

  const handleCancel = useCallback(() => {
    setDraftCode(savedCodeRef.current)
    setEditing(false)
  }, [])

  return (
    <NodeViewWrapper className="mermaid-block my-4" contentEditable={false}>
      <div className="rounded-[8px] border border-black bg-[#1e1e1e] shadow-[4px_4px_0_#333] overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[#333] px-3 py-1.5">
          <span className="font-mono text-[0.7rem] font-semibold tracking-widest text-[#c792ea]">mermaid</span>
          {editor.isEditable && (
            <button
              onMouseDown={e => { e.preventDefault(); setDraftCode(node.attrs.code as string); setEditing(v => !v) }}
              className="text-[0.7rem] font-bold text-[#888] hover:text-white"
            >
              {editing ? '닫기' : '편집'}
            </button>
          )}
        </div>

        {/* Diagram / error view */}
        {!editing && (
          <div className="p-4">
            {renderError
              ? <pre className="whitespace-pre-wrap text-xs text-red-400">{renderError}</pre>
              : svg
                ? <div className="flex justify-center overflow-x-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                : <p className="text-xs text-[#666]">렌더링 중…</p>
            }
          </div>
        )}

        {/* Source editor */}
        {editing && (
          <div className="p-3">
            <textarea
              className="w-full resize-none rounded border border-[#444] bg-[#111] p-2.5 font-mono text-sm text-[#d4d4d4] outline-none focus:border-[#666]"
              rows={Math.max(4, draftCode.split('\n').length + 1)}
              value={draftCode}
              onChange={e => setDraftCode(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const ta = e.currentTarget
                  const s = ta.selectionStart ?? 0
                  const end = ta.selectionEnd ?? 0
                  const next = draftCode.slice(0, s) + '  ' + draftCode.slice(end)
                  setDraftCode(next)
                  requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
                }
              }}
            />
            <div className="mt-2 flex gap-2">
              <button
                onMouseDown={e => { e.preventDefault(); handleSave() }}
                className="rounded-[6px] border border-black bg-[#baf7c8] px-3 py-1 text-xs font-black text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5"
              >저장</button>
              <button
                onMouseDown={e => { e.preventDefault(); handleCancel() }}
                className="rounded-[6px] border border-[#555] px-3 py-1 text-xs font-bold text-[#ccc] hover:text-white"
              >취소</button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

// ── Mermaid block Node extension ───────────────────────────────────────────

const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: element => element.getAttribute('data-code') ?? '',
        renderHTML: attributes => ({ 'data-code': attributes.code as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'mermaid-block' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView)
  },
})

// ── KaTeX LaTeX 렌더링 헬퍼 ──────────────────────────────────────────────
function renderLatexToHtml(latex: string, displayMode: boolean): string {
  if (!latex || !latex.trim()) return ''
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      errorColor: '#ef4444',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '수식 오류'
    return `<span class="text-red-400 font-mono text-xs">[수식 렌더링 실패: ${escapeHtmlAttribute(msg)}]</span>`
  }
}

// ── MathBlock (블록 수식) NodeView ─────────────────────────────────────────
function MathBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const [draftLatex, setDraftLatex] = useState<string>(node.attrs.latex as string)
  const savedLatexRef = useRef<string>(node.attrs.latex as string)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!editing) {
      setDraftLatex(node.attrs.latex as string)
      savedLatexRef.current = node.attrs.latex as string
    }
  }, [node.attrs.latex, editing])

  const handleSave = useCallback(() => {
    updateAttributes({ latex: draftLatex })
    savedLatexRef.current = draftLatex
    setEditing(false)
  }, [draftLatex, updateAttributes])

  const handleCancel = useCallback(() => {
    setDraftLatex(savedLatexRef.current)
    setEditing(false)
  }, [])

  const handleCopy = useCallback(async () => {
    const raw = (node.attrs.latex as string) || ''
    try {
      await navigator.clipboard.writeText(`$$\n${raw}\n$$`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1000)
    } catch {
      // 클립보드 접근 불가 시 무시함
    }
  }, [node.attrs.latex])

  const rawLatex = (node.attrs.latex as string) || ''
  const renderedHtml = renderLatexToHtml(rawLatex, true)

  return (
    <NodeViewWrapper className="math-block my-4" contentEditable={false}>
      <div className="rounded-[8px] border border-black bg-[#161b22] text-[#e6edf3] shadow-[4px_4px_0_#000] overflow-hidden">
        {/* 상단 헤더 바 */}
        <div className="flex items-center justify-between border-b border-[#30363d] px-3 py-1.5 bg-[#0d1117]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.7rem] font-bold tracking-widest text-[#58a6ff]">TeX</span>
            <span className="text-[0.68rem] text-[#8b949e]">수식 블록</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onMouseDown={e => { e.preventDefault(); handleCopy() }}
              className="text-[0.7rem] font-bold text-[#8b949e] hover:text-[#58a6ff] transition-colors"
            >
              {copied ? '복사됨' : '복사'}
            </button>
            {editor.isEditable && (
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  setDraftLatex(node.attrs.latex as string)
                  setEditing(v => !v)
                }}
                className="text-[0.7rem] font-bold text-[#8b949e] hover:text-white transition-colors"
              >
                {editing ? '닫기' : '편집'}
              </button>
            )}
          </div>
        </div>

        {/* 수식 렌더링 뷰 */}
        {!editing && (
          <div className="p-4 overflow-x-auto text-center flex justify-center items-center min-h-[56px]">
            {rawLatex.trim() ? (
              <div
                className="inline-block max-w-full [&_.katex-display]:my-0"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <p className="text-xs text-[#8b949e]">수식이 비어 있습니다 (편집을 눌러 LaTeX 입력)</p>
            )}
          </div>
        )}

        {/* 편집기 (텍스트에어리어 + 실시간 미리보기) */}
        {editing && (
          <div className="p-3 bg-[#0d1117] border-t border-[#30363d]">
            <textarea
              className="w-full resize-none rounded border border-[#30363d] bg-[#161b22] p-2.5 font-mono text-sm text-[#79c0ff] outline-none focus:border-[#58a6ff]"
              rows={Math.max(3, draftLatex.split('\n').length + 1)}
              value={draftLatex}
              placeholder="LaTeX 수식을 입력하세요. (예: M_{reg}(r, \theta) = ...)"
              onChange={e => setDraftLatex(e.target.value)}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  handleCancel()
                }
              }}
            />
            {/* 실시간 미리보기 */}
            <div className="mt-2 p-3 rounded border border-[#21262d] bg-[#161b22] text-center overflow-x-auto min-h-[44px] flex items-center justify-center">
              <div
                className="inline-block max-w-full [&_.katex-display]:my-0"
                dangerouslySetInnerHTML={{ __html: renderLatexToHtml(draftLatex, true) }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-[#8b949e]">Ctrl+Enter: 저장 | Esc: 취소</span>
              <div className="flex gap-2">
                <button
                  onMouseDown={e => { e.preventDefault(); handleSave() }}
                  className="rounded-[6px] border border-black bg-[#baf7c8] px-3 py-1 text-xs font-black text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5"
                >저장</button>
                <button
                  onMouseDown={e => { e.preventDefault(); handleCancel() }}
                  className="rounded-[6px] border border-[#555] px-3 py-1 text-xs font-bold text-[#ccc] hover:text-white"
                >취소</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

// ── MathBlock TipTap 노드 정의 ──────────────────────────────────────────────
const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => element.getAttribute('data-latex') ?? '',
        renderHTML: attributes => ({ 'data-latex': attributes.latex as string }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="math-block"]' },
      { tag: 'div.math-block' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'math-block' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView)
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$\s*$/,
        handler: ({ state, range }) => {
          const { tr } = state
          const mathBlockType = state.schema.nodes.mathBlock
          if (!mathBlockType) return null
          tr.replaceWith(range.from - 1, range.to, mathBlockType.create({ latex: '' }))
        },
      }),
    ]
  },
})

// ── MathInline (인라인 수식) NodeView ─────────────────────────────────────────
function MathInlineView({ node, updateAttributes, editor }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const [draftLatex, setDraftLatex] = useState<string>(node.attrs.latex as string)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      setDraftLatex(node.attrs.latex as string)
    }
  }, [node.attrs.latex, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const handleSave = () => {
    updateAttributes({ latex: draftLatex })
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraftLatex(node.attrs.latex as string)
      setEditing(false)
    }
  }

  const rawLatex = (node.attrs.latex as string) || ''
  const renderedHtml = renderLatexToHtml(rawLatex, false)

  return (
    <NodeViewWrapper as="span" className="math-inline inline-flex items-center align-baseline mx-0.5" contentEditable={false}>
      {!editing ? (
        <span
          onClick={() => { if (editor.isEditable) setEditing(true) }}
          className={`inline-flex items-center px-1 py-0.5 rounded cursor-pointer transition-colors ${
            editor.isEditable
              ? 'hover:bg-[#58a6ff1a] hover:outline hover:outline-1 hover:outline-[#58a6ff80]'
              : ''
          }`}
          title={editor.isEditable ? `수식 편집 (클릭): $${rawLatex}$` : `$${rawLatex}$`}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <span className="inline-flex items-center gap-0.5 bg-[#0d1117] border border-[#58a6ff] rounded px-1.5 py-0.5 shadow-sm text-xs">
          <span className="text-[10px] text-[#58a6ff] font-mono font-bold">$</span>
          <input
            ref={inputRef}
            type="text"
            value={draftLatex}
            onChange={e => setDraftLatex(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="bg-transparent border-none outline-none font-mono text-[#79c0ff] min-w-[100px] max-w-[300px]"
          />
          <span className="text-[10px] text-[#58a6ff] font-mono font-bold">$</span>
        </span>
      )}
    </NodeViewWrapper>
  )
}

// ── MathInline TipTap 노드 정의 ──────────────────────────────────────────────
const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => element.getAttribute('data-latex') ?? '',
        renderHTML: attributes => ({ 'data-latex': attributes.latex as string }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-type="math-inline"]' },
      { tag: 'span.math-inline' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'math-inline' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView)
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)(\$([^$\n]+)\$)$/,
        handler: ({ state, range, match }) => {
          const fullMatch = match[0]
          const latexWithDollar = match[1]
          const latex = match[2]
          if (!latexWithDollar || !latex) return null

          const leadingOffset = fullMatch.indexOf(latexWithDollar)
          const from = range.from + leadingOffset
          const to = from + latexWithDollar.length
          const mathInlineType = state.schema.nodes.mathInline
          if (!mathInlineType) return null

          state.tr.replaceWith(from, to, mathInlineType.create({ latex }))
        },
      }),
    ]
  },
})

// ──────────────────────────────────────────────────────────────────────────

const CodeBlockWithLang = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'codeBlock' && node.attrs.language) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    'data-language': node.attrs.language,
                  })
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
}).configure({ lowlight })

interface DocumentEditorProps {
  content: Record<string, unknown> | null
  editable: boolean
  onChange: (content: Record<string, unknown>) => void
  onUploadImage?: (file: File) => Promise<{
    id: string
    url: string
    storagePath?: string
    alt?: string
  }>
  onCloneImage?: (source: {
    assetId?: string
    storagePath?: string
    src: string
    alt?: string
  }) => Promise<{
    id: string
    url: string
    storagePath?: string
    alt?: string
  }>
}

const EMPTY_DOC_CONTENT: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

// ── 레거시/외부 평문 텍스트 내 수식($...$, $$...$$) 자동 정규화 헬퍼 ──────────────────
function splitTextWithMath(text: string, marks?: Record<string, unknown>[]): Array<Record<string, unknown>> {
  if (!text || (!text.includes('$') && !text.includes('$$'))) {
    return [{ type: 'text', text, ...(marks?.length ? { marks } : {}) }]
  }

  const result: Array<Record<string, unknown>> = []
  const mathRegex = /(\${1,2})([^$\n]+?)\1/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mathRegex.exec(text)) !== null) {
    const matchStart = match.index
    const matchEnd = mathRegex.lastIndex
    const latex = match[2].trim()

    if (matchStart > lastIndex) {
      const before = text.slice(lastIndex, matchStart)
      result.push({ type: 'text', text: before, ...(marks?.length ? { marks } : {}) })
    }

    if (latex) {
      result.push({ type: 'mathInline', attrs: { latex } })
    } else {
      result.push({ type: 'text', text: match[0], ...(marks?.length ? { marks } : {}) })
    }

    lastIndex = matchEnd
  }

  if (lastIndex < text.length) {
    result.push({ type: 'text', text: text.slice(lastIndex), ...(marks?.length ? { marks } : {}) })
  }

  return result.length ? result : [{ type: 'text', text, ...(marks?.length ? { marks } : {}) }]
}

function normalizeParagraphNode(paragraph: Record<string, unknown>): Array<Record<string, unknown>> {
  const content = paragraph.content as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(content) || content.length === 0) {
    return [paragraph]
  }

  // 문단 전체가 $$...$$ 로만 이루어진 블록 수식인 경우 mathBlock 노드로 승격함
  const fullText = content.map(c => (typeof c.text === 'string' ? c.text : '')).join('')
  const trimmed = fullText.trim()
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    const latex = trimmed.slice(2, -2).trim()
    return [{ type: 'mathBlock', attrs: { latex } }]
  }

  // 문단 내 인라인 텍스트에 $수식$이 포함되어 있는지 검사하여 mathInline으로 분할함
  let hasMath = false
  const newContent: Array<Record<string, unknown>> = []

  for (const item of content) {
    if (item.type === 'text' && typeof item.text === 'string' && item.text.includes('$')) {
      const parts = splitTextWithMath(item.text, item.marks as Record<string, unknown>[] | undefined)
      if (parts.some(p => p.type === 'mathInline')) {
        hasMath = true
        newContent.push(...parts)
        continue
      }
    }
    newContent.push(item)
  }

  return hasMath ? [{ ...paragraph, content: newContent }] : [paragraph]
}

function normalizeDocumentMathContent(doc: Record<string, unknown>): Record<string, unknown> {
  if (!doc || typeof doc !== 'object') return doc
  if (!Array.isArray(doc.content)) return doc

  const newContent: Array<Record<string, unknown>> = []

  for (const node of doc.content as Array<Record<string, unknown>>) {
    if (!node || typeof node !== 'object') {
      newContent.push(node)
      continue
    }

    if (node.type === 'paragraph') {
      newContent.push(...normalizeParagraphNode(node))
    } else if (Array.isArray(node.content)) {
      newContent.push(normalizeDocumentMathContent(node))
    } else {
      newContent.push(node)
    }
  }

  return { ...doc, content: newContent }
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function DocumentImageView({ node, selected }: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const attrs = node.attrs as {
    src?: string | null
    alt?: string | null
    title?: string | null
    assetId?: string | null
    storagePath?: string | null
    uploadState?: string | null
  }
  const src = attrs.src ?? ''
  const alt = attrs.alt ?? ''
  const title = attrs.title ?? ''
  const assetId = attrs.assetId ?? ''
  const storagePath = attrs.storagePath ?? ''
  const isUploading = attrs.uploadState === 'uploading' || attrs.uploadState === 'cloning'

  const copyImage = async () => {
    if (!src || isUploading) return

    const html = [
      '<img',
      ' data-cowork26-image="true"',
      assetId ? ` data-asset-id="${escapeHtmlAttribute(assetId)}"` : '',
      storagePath ? ` data-storage-path="${escapeHtmlAttribute(storagePath)}"` : '',
      ` src="${escapeHtmlAttribute(src)}"`,
      ` alt="${escapeHtmlAttribute(alt)}"`,
      title ? ` title="${escapeHtmlAttribute(title)}"` : '',
      '>',
    ].join('')
    const markdown = `![${alt}](${src}${title ? ` "${title}"` : ''})`

    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([markdown], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(markdown)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1000)
    } catch (error) {
      console.error('Image copy failed', error)
    }
  }

  return (
    <NodeViewWrapper
      className={`group relative my-4 inline-block max-w-full rounded-[8px] ${
        selected ? 'outline outline-2 outline-[#baf7c8]' : ''
      }`}
      contentEditable={false}
    >
      <img
        src={src}
        alt={alt}
        title={title}
        className="max-w-full rounded-[8px] border border-black shadow-[3px_3px_0_#000]"
        data-asset-id={assetId || undefined}
        data-storage-path={storagePath || undefined}
        data-upload-state={attrs.uploadState ?? undefined}
      />
      <button
        type="button"
        className="absolute right-2 top-2 rounded-[8px] border border-black bg-[#baf7c8] px-2 py-1 text-[11px] font-black text-black opacity-0 shadow-[2px_2px_0_#000] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#d7d2c8] disabled:opacity-80 group-hover:opacity-100"
        onMouseDown={event => event.preventDefault()}
        onClick={copyImage}
        disabled={!src || isUploading}
      >
        {isUploading ? 'Uploading' : copied ? 'Copied' : 'Copy'}
      </button>
    </NodeViewWrapper>
  )
}

const DocumentImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: element => element.getAttribute('data-asset-id'),
        renderHTML: attributes => attributes.assetId ? { 'data-asset-id': attributes.assetId } : {},
      },
      storagePath: {
        default: null,
        parseHTML: element => element.getAttribute('data-storage-path'),
        renderHTML: attributes => attributes.storagePath ? { 'data-storage-path': attributes.storagePath } : {},
      },
      uploadState: {
        default: null,
        parseHTML: element => element.getAttribute('data-upload-state'),
        renderHTML: attributes => attributes.uploadState ? { 'data-upload-state': attributes.uploadState } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(DocumentImageView)
  },
}).configure({
  allowBase64: false,
})

const DEBUG_SAVE_FLOW = process.env.NODE_ENV !== 'production'

function debugSaveFlow(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_SAVE_FLOW) return
  console.log(`[save-flow] editor ${message}`, data ?? {})
}

const MIN_ROW_HEIGHT = 28
const MAX_ROW_HEIGHT = 160
const ROW_RESIZE_HANDLE_SIZE = 6

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

const ResizableHeightTableRow = TableRow.extend({
  addAttributes() {
    return {
      rowHeight: {
        default: null,
        parseHTML: element => {
          const value = element.getAttribute('data-row-height') || element.style.height
          const parsedValue = Number.parseInt(value, 10)

          return Number.isFinite(parsedValue) ? parsedValue : null
        },
        renderHTML: attributes => {
          const rowHeight = Number(attributes.rowHeight)
          if (!Number.isFinite(rowHeight)) return {}

          const normalizedRowHeight = clampNumber(rowHeight, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT)

          return {
            'data-row-height': String(normalizedRowHeight),
            style: `height: ${normalizedRowHeight}px`,
          }
        },
      },
    }
  },
})

const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: element => element.style.fontSize || null,
        renderHTML: attributes => (
          attributes.size ? { style: `font-size: ${attributes.size}` } : {}
        ),
      },
    }
  },

  parseHTML() {
    return [{ style: 'font-size' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

const ChipLink = Link.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))$/,
        handler: ({ state, range, match }) => {
          const fullMatch = match[0]
          const markdownLink = match[1]
          const label = match[2]
          const href = match[3]
          if (!markdownLink || !label || !href) return null

          const leadingOffset = fullMatch.indexOf(markdownLink)
          const from = range.from + leadingOffset
          const to = from + markdownLink.length
          const mark = state.schema.marks.link.create({
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'url-chip',
          })

          state.tr
            .replaceWith(from, to, state.schema.text(label, [mark]))
            .removeStoredMark(state.schema.marks.link)
        },
      }),
    ]
  },
})

const ListTabKeymap = Extension.create({
  name: 'listTabKeymap',

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.sinkListItem('listItem'),
      'Shift-Tab': () => this.editor.commands.liftListItem('listItem'),
    }
  },
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const MARKDOWN_LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g
const INLINE_MARKDOWN_PATTERN = /(`[^`\n]+`|\$[^$\n]+\$|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|(^|[\s(])\*(?!\*)([^*\n]+?)\*(?!\*)|(^|[\s(])_(?!_)([^_\n]+?)_(?!_))/

function hasMarkdownLink(text: string) {
  MARKDOWN_LINK_PATTERN.lastIndex = 0
  return MARKDOWN_LINK_PATTERN.test(text)
}

function hasInlineMarkdown(text: string) {
  return hasMarkdownLink(text) || INLINE_MARKDOWN_PATTERN.test(text)
}

function renderInlineMarkdown(value: string) {
  const htmlTokens: string[] = []
  const stash = (html: string) => {
    const tokenIndex = htmlTokens.push(html) - 1
    return `@@INLINE_TOKEN_${tokenIndex}@@`
  }

  let escaped = escapeHtml(value)

  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, href) => (
    stash(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`)
  ))

  escaped = escaped.replace(/`([^`]+)`/g, (_match, code) => stash(`<code>${code}</code>`))

  // 인라인 수식 ($...$) 토큰화: 밑줄(_)이나 별표(*)가 이탤릭으로 깨지지 않도록 강조 서식보다 먼저 보호함
  escaped = escaped.replace(/\$([^$\n]+)\$/g, (_match, rawLatexEscaped) => {
    const rawLatex = rawLatexEscaped
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")

    if (!rawLatex.trim()) return _match
    return stash(`<span data-type="math-inline" data-latex="${escapeHtmlAttribute(rawLatex)}">${escapeHtml(rawLatex)}</span>`)
  })

  escaped = escaped.replace(/__(.+?)__/g, (_match, strong) => stash(`<strong>${strong}</strong>`))
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, (_match, strong) => stash(`<strong>${strong}</strong>`))
  escaped = escaped.replace(/~~(.+?)~~/g, (_match, strike) => stash(`<s>${strike}</s>`))
  escaped = escaped.replace(/(^|[\s(])\*(?!\*)([^*\n]+?)\*(?!\*)/g, (_match, prefix, emphasis) => (
    `${prefix}${stash(`<em>${emphasis}</em>`)}`
  ))
  escaped = escaped.replace(/(^|[\s(])_(?!_)([^_\n]+?)_(?!_)/g, (_match, prefix, emphasis) => (
    `${prefix}${stash(`<em>${emphasis}</em>`)}`
  ))

  return escaped.replace(/@@INLINE_TOKEN_(\d+)@@/g, (_match, tokenIndex) => htmlTokens[Number(tokenIndex)] ?? '')
}

function renderInlineMarkdownLine(line: string) {
  return renderInlineMarkdown(line)
}

function renderRichParagraphHtml(text: string) {
  const htmlLines = text.split(/\n/).map(renderInlineMarkdownLine)
  return `<p>${htmlLines.join('<br>')}</p>`
}

function renderHeadingHtml(level: number, text: string) {
  const safeLevel = clampNumber(level, 1, 6)
  return `<h${safeLevel}>${renderInlineMarkdown(text)}</h${safeLevel}>`
}

function renderBlockquoteHtml(lines: string[]) {
  const text = lines.join('\n').trim()
  return `<blockquote>${renderRichParagraphHtml(text)}</blockquote>`
}

function renderListHtml(kind: 'bullet' | 'ordered', items: string[]) {
  const tag = kind === 'ordered' ? 'ol' : 'ul'
  const itemHtml = items
    .map(item => `<li>${renderRichParagraphHtml(item)}</li>`)
    .join('')
  return `<${tag}>${itemHtml}</${tag}>`
}

function findTableRowPos(view: EditorView, row: HTMLTableRowElement) {
  const estimatedPos = view.posAtDOM(row, 0)
  const docSize = view.state.doc.content.size
  const safePos = clampNumber(estimatedPos, 0, docSize)
  const resolvedPos = view.state.doc.resolve(safePos)

  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    if (resolvedPos.node(depth).type.name === 'tableRow') {
      return resolvedPos.before(depth)
    }
  }

  for (let pos = Math.max(0, safePos - 3); pos <= Math.min(docSize, safePos + 3); pos += 1) {
    if (view.state.doc.nodeAt(pos)?.type.name === 'tableRow') {
      return pos
    }
  }

  return null
}

function getRowResizeTarget(view: EditorView, event: MouseEvent) {
  if (!(event.target instanceof Element)) return null
  if (event.target.closest('.column-resize-handle')) return null

  const cell = event.target.closest('td, th')
  if (!(cell instanceof HTMLTableCellElement)) return null

  const cellRect = cell.getBoundingClientRect()
  const isOnBottomEdge = cellRect.bottom - event.clientY <= ROW_RESIZE_HANDLE_SIZE
  if (!isOnBottomEdge) return null

  const row = cell.closest('tr')
  if (!(row instanceof HTMLTableRowElement)) return null

  const rowPos = findTableRowPos(view, row)
  if (rowPos === null) return null

  const rowNode = view.state.doc.nodeAt(rowPos)
  if (rowNode?.type.name !== 'tableRow') return null

  return { row, rowNode, rowPos }
}

const TABLE_DIVIDER_PATTERN = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/

function isMarkdownTableDivider(line: string) {
  return line.includes('|') && TABLE_DIVIDER_PATTERN.test(line.trim())
}

function renderMarkdownTableHtml(tableLines: string[]) {
  const lines = tableLines
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length < 2 || !lines[0]?.includes('|') || !isMarkdownTableDivider(lines[1] ?? '')) {
    return null
  }

  const toCells = (line: string) => line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

  const headers = toCells(lines[0])
  const rows = lines.slice(2).map(toCells)

  if (!headers.length || rows.some(row => row.length !== headers.length)) return null

  const headerHtml = headers.map(cell => `<th><p>${renderInlineMarkdown(cell)}</p></th>`).join('')
  const rowsHtml = rows
    .map(row => `<tr>${row.map(cell => `<td><p>${renderInlineMarkdown(cell)}</p></td>`).join('')}</tr>`)
    .join('')

  return `<table><tbody><tr>${headerHtml}</tr>${rowsHtml}</tbody></table>`
}

type MarkdownPasteBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'horizontalRule' }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'list'; kind: 'bullet' | 'ordered'; items: string[] }
  | { type: 'table'; lines: string[] }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'math'; latex: string }

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/
const HORIZONTAL_RULE_PATTERN = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/
const BULLET_LIST_PATTERN = /^[-*+]\s+(.+)$/
const ORDERED_LIST_PATTERN = /^\d+[.)]\s+(.+)$/
const FENCED_CODE_START_PATTERN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)?.*$/

function getFencedCodeStart(line: string) {
  const match = line.match(FENCED_CODE_START_PATTERN)
  if (!match) return null

  const marker = match[1]
  const markerChar = marker[0]
  if (!markerChar) return null

  return {
    markerChar,
    markerLength: marker.length,
    language: match[2]?.trim() || null,
  }
}

function isFencedCodeEnd(line: string, markerChar: string, markerLength: number) {
  const trimmed = line.trim()
  if (!trimmed.startsWith(markerChar.repeat(markerLength))) return false
  return [...trimmed].every(char => char === markerChar)
}

// VS Code language id(mode) → lowlight 언어명 매핑. lowlight에 없는 언어는 그대로 두어도
// 하이라이팅만 생략될 뿐 코드블록으로는 정상 렌더링된다. 'plaintext'는 언어 없음으로 처리.
const VSCODE_LANGUAGE_MAP: Record<string, string | null> = {
  plaintext: null,
  javascript: 'javascript',
  javascriptreact: 'jsx',
  typescript: 'typescript',
  typescriptreact: 'tsx',
  shellscript: 'bash',
  jsonc: 'json',
  dockerfile: 'dockerfile',
  yaml: 'yaml',
}

function normalizeCodeLanguage(mode: string): string | null {
  if (mode in VSCODE_LANGUAGE_MAP) return VSCODE_LANGUAGE_MAP[mode]
  return mode || null
}

// VS Code 등 코드 에디터의 html은 <pre> 없이 monospace 폰트 + white-space:pre 스타일의
// <div>/<span>으로만 구성된다. 이 시그니처로 "코드 에디터에서 복사한 코드"를 식별한다.
function looksLikeCodeEditorHtml(html: string) {
  if (!html) return false
  if (!/white-space\s*:\s*pre/i.test(html)) return false
  return /font-family\s*:[^;"']*(monospace|consolas|courier|menlo|monaco|"?cascadia)/i.test(html)
}

// VS Code에서 코드를 복사하면 text/plain(펜스 없는 원본 코드)과 함께, 웹/일부 환경에서는
// 'vscode-editor-data' 전용 포맷(언어 mode 포함)이 담긴다. 데스크톱→브라우저 붙여넣기처럼
// 해당 포맷이 없는 경우에도 처리할 수 있도록 text/html의 monospace 시그니처를 폴백으로 쓴다.
// 인라인 조각 붙여넣기를 코드블록으로 오탐하지 않도록 여러 줄일 때만 코드블록으로 처리한다.
function getCodeEditorPaste(clipboardData: DataTransfer | null | undefined) {
  if (!clipboardData) return null
  const code = clipboardData.getData('text/plain')
  if (!code || !code.includes('\n')) return null

  const meta = clipboardData.getData('vscode-editor-data')
  const html = clipboardData.getData('text/html') ?? ''

  // 우리 에디터 내부 복사본은 별도 경로에서 처리하므로 여기서는 배제한다.
  if (html.includes('data-pm-slice')) return null
  if (!meta && !looksLikeCodeEditorHtml(html)) return null

  let language: string | null = null
  if (meta) {
    try {
      const parsed = JSON.parse(meta) as { mode?: unknown }
      if (typeof parsed.mode === 'string' && parsed.mode) {
        language = normalizeCodeLanguage(parsed.mode)
      }
    } catch {
      // 메타 파싱 실패 시 언어 없이 코드블록으로 처리
    }
  }

  return { code, language }
}

// 한 줄이 "코드처럼" 보이는지 판정한다. 키워드/구문기호/태그/들여쓰기 등을 신호로 본다.
const CODE_LINE_SIGNAL = /[{};]\s*$|=>|[^=!<>]=[^=]|\)\s*[:{]|\b(import|from|export|const|let|var|function|def|class|return|public|private|protected|static|void|package|namespace|async|await|new|typeof|interface|enum|struct|fn|impl|use|package)\b|\bconsole\.|\brequire\s*\(|\bmodule\.exports\b|<\/?[a-zA-Z][\w-]*[\s/>]|<!DOCTYPE|^\s*#\s*(include|define|import|pragma)|^\s*@[a-zA-Z]|^\s{2,}\S|^\t+\S/

// Azure KQL(Kusto)의 파이프 리딩 연산자 라인. '| where', '| project' 등.
const KQL_OPERATOR_LINE = /^\s*\|\s*(where|project(-away|-rename|-keep|-reorder)?|extend|summarize|order\s+by|sort\s+by|join|parse|take|top|limit|distinct|count|mv-expand|mv-apply|render|make-series|evaluate|union|as|invoke|lookup|serialize|sample|getschema)\b/i

// text/plain만 있는(서식/메타 없는) 붙여넣기에서 "이건 소스 코드다"를 휴리스틱으로 판정한다.
// 마크다운 문서를 코드로 오탐하지 않도록, 펜스(```)나 마크다운 표가 있으면 코드로 보지 않고
// 기존 마크다운 파서에 맡긴다. 코드처럼 보이는 줄 비율이 충분히 높을 때만 true.
function looksLikeSourceCode(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const nonEmpty = lines.filter(line => line.trim())
  if (nonEmpty.length < 2) return false

  // 펜스/마크다운 표/수식 블록이 있으면 마크다운 파서가 코드블록/표/수식으로 더 잘 처리한다.
  for (let i = 0; i < lines.length; i += 1) {
    if (getFencedCodeStart(lines[i] ?? '')) return false
    if ((lines[i] ?? '').includes('|') && isMarkdownTableDivider(lines[i + 1] ?? '')) return false
    if ((lines[i] ?? '').trim().startsWith('$$')) return false
  }

  // Azure KQL: '| where', '| project' 같은 파이프 리딩 연산자 라인이 2개 이상이면 코드로 본다.
  // (일반 코드 신호로는 잘 안 걸리는 쿼리 문법이라 별도로 감지)
  let kqlLines = 0
  for (const line of nonEmpty) {
    if (KQL_OPERATOR_LINE.test(line)) kqlLines += 1
  }
  if (kqlLines >= 2) return true

  let codeLines = 0
  for (const line of nonEmpty) {
    if (CODE_LINE_SIGNAL.test(line)) codeLines += 1
  }
  const ratio = codeLines / nonEmpty.length
  // 강한 신호가 2줄 이상이고 전체의 30% 이상이 코드처럼 보이면 코드로 간주.
  return codeLines >= 2 && ratio >= 0.3
}

// 붙여넣은 소스 코드의 언어를 추정해 코드블록 언어 배지에 쓴다. 명시적 시그니처를 우선하고,
// 없으면 lowlight 자동 감지를 폴백으로 쓴다(신뢰도 낮으면 null). 반환값은 lowlight common 언어명.
function detectCodeLanguage(text: string): string | null {
  const sample = text.slice(0, 4000)

  // KQL은 파이프 리딩 연산자가 여러 줄이면 확정. (일반 언어 감지보다 먼저 판정)
  const kqlOperatorCount = sample.split('\n').filter(line => KQL_OPERATOR_LINE.test(line)).length
  if (kqlOperatorCount >= 2) return 'kql'

  if (/^\s*<!DOCTYPE html/i.test(sample) || /<(html|head|body|div|span|script|template)[\s/>]/i.test(sample)) {
    return 'html'
  }
  if (/^\s*[{[]/.test(sample) && /"\s*:\s*/.test(sample) && !/\b(function|=>|def|import)\b/.test(sample)) {
    return 'json'
  }
  if (/\b(def|elif|lambda)\b/.test(sample) || /\bimport\s+\w+/.test(sample) && /:\s*$/m.test(sample) || /\bself\b/.test(sample) || /\bst\.session_state\b/.test(sample)) {
    return 'python'
  }
  if (/\binterface\s+\w+|:\s*(string|number|boolean|void|any)\b|\bimport\s+type\b|\bas\s+const\b/.test(sample)) {
    return 'typescript'
  }
  if (/\b(const|let|var|function)\b|=>|\brequire\s*\(|\bmodule\.exports\b|\bconsole\.(log|error)\b/.test(sample)) {
    return 'javascript'
  }
  if (/^[\s]*[.#]?[\w-]+\s*\{[^}]*:[^}]*;/m.test(sample) || /@media\b|:\s*[\w#(]+\s*;/.test(sample)) {
    return 'css'
  }
  if (/^#!.*\b(sh|bash|zsh)\b/.test(sample) || /^\s*(echo|sudo|apt|cd|npm|yarn|git|export)\s/m.test(sample)) {
    return 'bash'
  }

  try {
    const result = lowlight.highlightAuto(sample) as { data?: { language?: string; relevance?: number } }
    const language = result.data?.language
    const relevance = result.data?.relevance ?? 0
    if (language && relevance >= 5) return language
  } catch {
    // 감지 실패 시 언어 없이 코드블록으로
  }

  return null
}

function parseMarkdownPasteBlocks(text: string) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const blocks: MarkdownPasteBlock[] = []
  let paragraphLines: string[] = []
  let handledMarkdown = false

  const flushParagraph = () => {
    const paragraphText = paragraphLines.join('\n').trim()
    if (paragraphText) {
      blocks.push({ type: 'paragraph', text: paragraphText })
      if (hasInlineMarkdown(paragraphText)) handledMarkdown = true
    }
    paragraphLines = []
  }

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    const headingMatch = trimmed.match(HEADING_PATTERN)
    if (headingMatch) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      })
      handledMarkdown = true
      index += 1
      continue
    }

    if (HORIZONTAL_RULE_PATTERN.test(line)) {
      flushParagraph()
      blocks.push({ type: 'horizontalRule' })
      handledMarkdown = true
      index += 1
      continue
    }

    const blockquoteMatch = line.match(BLOCKQUOTE_PATTERN)
    if (blockquoteMatch) {
      flushParagraph()
      const quoteLines = [blockquoteMatch[1]]
      index += 1
      while (index < lines.length) {
        const nextQuoteMatch = (lines[index] ?? '').match(BLOCKQUOTE_PATTERN)
        if (!nextQuoteMatch) break
        quoteLines.push(nextQuoteMatch[1])
        index += 1
      }
      blocks.push({ type: 'blockquote', lines: quoteLines })
      handledMarkdown = true
      continue
    }

    const bulletListMatch = line.match(BULLET_LIST_PATTERN)
    const orderedListMatch = line.match(ORDERED_LIST_PATTERN)
    if (bulletListMatch || orderedListMatch) {
      flushParagraph()
      const kind = bulletListMatch ? 'bullet' : 'ordered'
      const items = [bulletListMatch?.[1] ?? orderedListMatch?.[1] ?? '']
      index += 1
      while (index < lines.length) {
        const nextMatch = kind === 'bullet'
          ? (lines[index] ?? '').match(BULLET_LIST_PATTERN)
          : (lines[index] ?? '').match(ORDERED_LIST_PATTERN)
        if (!nextMatch) break
        items.push(nextMatch[1])
        index += 1
      }
      blocks.push({ type: 'list', kind, items })
      handledMarkdown = true
      continue
    }

    // 수식 블록 ($$...$$ 또는 다중행/미완성 $$) 감지함
    if (trimmed.startsWith('$$')) {
      flushParagraph()
      if (trimmed.endsWith('$$') && trimmed.length > 2 && trimmed !== '$$') {
        const latex = trimmed.slice(2, -2).trim()
        blocks.push({ type: 'math', latex })
        handledMarkdown = true
        index += 1
        continue
      }

      const mathLines: string[] = []
      const firstLineContent = trimmed.slice(2).trim()
      if (firstLineContent) mathLines.push(firstLineContent)
      index += 1

      while (index < lines.length) {
        const nextRaw = lines[index] ?? ''
        const nextTrimmed = nextRaw.trim()
        if (nextTrimmed.endsWith('$$')) {
          const lastLineContent = nextTrimmed.slice(0, -2).trim()
          if (lastLineContent) mathLines.push(lastLineContent)
          index += 1
          break
        }
        mathLines.push(nextRaw)
        index += 1
      }

      const latex = mathLines.join('\n').trim()
      blocks.push({ type: 'math', latex })
      handledMarkdown = true
      continue
    }

    const fenceStart = getFencedCodeStart(line)
    if (fenceStart) {
      flushParagraph()
      const codeLines: string[] = []
      index += 1
      while (
        index < lines.length &&
        !isFencedCodeEnd(lines[index] ?? '', fenceStart.markerChar, fenceStart.markerLength)
      ) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index >= lines.length) {
        paragraphLines.push(line, ...codeLines)
        continue
      }

      index += 1
      blocks.push({
        type: 'code',
        language: fenceStart.language,
        code: codeLines.join('\n'),
      })
      handledMarkdown = true
      continue
    }

    const nextLine = lines[index + 1] ?? ''
    if (line.includes('|') && isMarkdownTableDivider(nextLine)) {
      flushParagraph()
      const tableLines = [line, nextLine]
      index += 2
      while (index < lines.length && (lines[index] ?? '').trim() && (lines[index] ?? '').includes('|')) {
        tableLines.push(lines[index] ?? '')
        index += 1
      }
      blocks.push({ type: 'table', lines: tableLines })
      handledMarkdown = true
      continue
    }

    paragraphLines.push(line)
    index += 1
  }

  flushParagraph()

  return handledMarkdown ? blocks : null
}

function htmlToNodes(schema: Schema, html: string) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  const slice = ProseMirrorDOMParser.fromSchema(schema).parseSlice(wrapper)
  const nodes: ProseMirrorNode[] = []
  slice.content.forEach(node => {
    nodes.push(node)
  })
  return nodes
}

function markdownPasteBlocksToSlice(schema: Schema, blocks: MarkdownPasteBlock[]) {
  const nodes: ProseMirrorNode[] = []

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      nodes.push(...htmlToNodes(schema, renderRichParagraphHtml(block.text)))
      continue
    }

    if (block.type === 'heading') {
      nodes.push(...htmlToNodes(schema, renderHeadingHtml(block.level, block.text)))
      continue
    }

    if (block.type === 'horizontalRule') {
      const horizontalRuleType = schema.nodes.horizontalRule
      if (horizontalRuleType) nodes.push(horizontalRuleType.create())
      continue
    }

    if (block.type === 'blockquote') {
      nodes.push(...htmlToNodes(schema, renderBlockquoteHtml(block.lines)))
      continue
    }

    if (block.type === 'list') {
      nodes.push(...htmlToNodes(schema, renderListHtml(block.kind, block.items)))
      continue
    }

    if (block.type === 'table') {
      const tableHtml = renderMarkdownTableHtml(block.lines)
      if (!tableHtml) {
        nodes.push(...htmlToNodes(schema, renderRichParagraphHtml(block.lines.join('\n'))))
        continue
      }
      nodes.push(...htmlToNodes(schema, tableHtml))
      continue
    }

    if (block.type === 'code') {
      if (block.language === 'mermaid') {
        const mermaidBlockType = schema.nodes.mermaidBlock
        if (mermaidBlockType) {
          nodes.push(mermaidBlockType.create({ code: block.code }))
        }
        continue
      }

      const codeBlockType = schema.nodes.codeBlock
      if (!codeBlockType) continue
      nodes.push(
        block.code
          ? codeBlockType.create({ language: block.language }, schema.text(block.code))
          : codeBlockType.create({ language: block.language })
      )
      continue
    }

    if (block.type === 'math') {
      const mathBlockType = schema.nodes.mathBlock
      if (mathBlockType) {
        nodes.push(mathBlockType.create({ latex: block.latex }))
      }
      continue
    }
  }

  return nodes.length ? new Slice(Fragment.fromArray(nodes), 0, 0) : null
}

function parseMarkdownPasteToSlice(schema: Schema, text: string) {
  const blocks = parseMarkdownPasteBlocks(text)
  if (!blocks) return null
  return markdownPasteBlocksToSlice(schema, blocks)
}

function findImagePositionBySrc(view: EditorView, src: string) {
  let foundPos: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === src) {
      foundPos = pos
      return false
    }
    return true
  })
  return foundPos
}

function replaceImageAttributesBySrc(view: EditorView, src: string, attrs: Record<string, unknown>) {
  const pos = findImagePositionBySrc(view, src)
  if (pos === null) return false

  const node = view.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'image') return false

  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    ...attrs,
  }))
  return true
}

function removeImageBySrc(view: EditorView, src: string) {
  const pos = findImagePositionBySrc(view, src)
  if (pos === null) return false

  const node = view.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'image') return false

  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize))
  return true
}

function getCoworkImageFromHtml(html: string) {
  if (!html) return null

  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  const image = wrapper.querySelector<HTMLImageElement>('img[data-cowork26-image="true"]')
  if (!image?.src) return null

  return {
    assetId: image.getAttribute('data-asset-id') || undefined,
    storagePath: image.getAttribute('data-storage-path') || undefined,
    src: image.src,
    alt: image.alt || undefined,
  }
}

function documentHasPendingImageUpload(content: Record<string, unknown>) {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false
    const current = node as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown }
    if (
      current.type === 'image' &&
      (current.attrs?.uploadState === 'uploading' || current.attrs?.uploadState === 'cloning')
    ) {
      return true
    }

    return Array.isArray(current.content) && current.content.some(visit)
  }

  return visit(content)
}

export default function DocumentEditor({ content, editable, onChange, onUploadImage, onCloneImage }: DocumentEditorProps) {
  // 레거시/외부에서 들어온 평문 수식($...$, $$...$$)을 TipTap mathBlock/mathInline 노드로 자동 정규화함
  const resolvedContent = useMemo(
    () => normalizeDocumentMathContent(content ?? EMPTY_DOC_CONTENT),
    [content]
  )
  const onChangeRef = useRef(onChange)
  const onUploadImageRef = useRef(onUploadImage)
  const onCloneImageRef = useRef(onCloneImage)
  const baselineContentRef = useRef(resolvedContent)
  const applyingContentRef = useRef(false)
  baselineContentRef.current = resolvedContent

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onUploadImageRef.current = onUploadImage
  }, [onUploadImage])

  useEffect(() => {
    onCloneImageRef.current = onCloneImage
  }, [onCloneImage])

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false }),
      CodeBlockWithLang,
      ChipLink.configure({
        autolink: false,
        linkOnPaste: false,
        openOnClick: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
          class: null,
        },
      }),
      MermaidBlock,
      MathBlock,
      MathInline,
      DocumentImage,
      ListTabKeymap,
      FontSize,
      Table.configure({
        resizable: true,
        cellMinWidth: 72,
      }),
      ResizableHeightTableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: '내용을 입력하세요.',
      }),
    ],
    content: resolvedContent,
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none',
      },
      handlePaste(view, event) {
        // Excel/구글시트 등에서 셀을 복사하면 표 렌더링 이미지(image/png)가 text/html의
        // <table>과 함께 클립보드에 담긴다. 이때는 표 붙여넣기를 우선해야 하므로
        // <table>이 있는 경우에는 이미지 우선 처리를 건너뛴다.
        const pastedHtmlForImageCheck = event.clipboardData?.getData('text/html') ?? ''
        const hasPastedTable = /<table[\s>]/i.test(pastedHtmlForImageCheck)

        const imageFile = Array
          .from(event.clipboardData?.items ?? [])
          .find(item => item.type.startsWith('image/'))
          ?.getAsFile()

        if (imageFile && onUploadImageRef.current && !hasPastedTable) {
          event.preventDefault()
          const previewUrl = URL.createObjectURL(imageFile)
          const imageNode = view.state.schema.nodes.image?.create({
            src: previewUrl,
            alt: imageFile.name || 'pasted image',
            title: '',
            uploadState: 'uploading',
          })

          if (!imageNode) {
            URL.revokeObjectURL(previewUrl)
            return true
          }

          applyingContentRef.current = true
          view.dispatch(view.state.tr.replaceSelectionWith(imageNode).scrollIntoView())
          window.requestAnimationFrame(() => {
            applyingContentRef.current = false
          })

          onUploadImageRef.current(imageFile)
            .then(uploaded => {
              applyingContentRef.current = false
              replaceImageAttributesBySrc(view, previewUrl, {
                src: uploaded.url,
                alt: uploaded.alt ?? imageFile.name ?? '',
                assetId: uploaded.id,
                storagePath: uploaded.storagePath ?? null,
                uploadState: null,
              })
            })
            .catch(error => {
              console.error('Image upload failed', error)
              applyingContentRef.current = false
              removeImageBySrc(view, previewUrl)
            })
            .finally(() => {
              URL.revokeObjectURL(previewUrl)
            })

          return true
        }

        const coworkImage = getCoworkImageFromHtml(event.clipboardData?.getData('text/html') ?? '')
        if (coworkImage && onCloneImageRef.current) {
          event.preventDefault()
          const imageNode = view.state.schema.nodes.image?.create({
            src: coworkImage.src,
            alt: coworkImage.alt ?? 'copied image',
            title: '',
            uploadState: 'cloning',
          })

          if (!imageNode) return true

          applyingContentRef.current = true
          view.dispatch(view.state.tr.replaceSelectionWith(imageNode).scrollIntoView())
          window.requestAnimationFrame(() => {
            applyingContentRef.current = false
          })

          onCloneImageRef.current(coworkImage)
            .then(cloned => {
              applyingContentRef.current = false
              replaceImageAttributesBySrc(view, coworkImage.src, {
                src: cloned.url,
                alt: cloned.alt ?? coworkImage.alt ?? '',
                assetId: cloned.id,
                storagePath: cloned.storagePath ?? null,
                uploadState: null,
              })
            })
            .catch(error => {
              console.error('Image clone failed', error)
              applyingContentRef.current = false
              removeImageBySrc(view, coworkImage.src)
            })

          return true
        }

        // VS Code 등 코드 에디터에서 복사한 코드는 text/plain에 펜스(```)가 없어 마크다운 파서가
        // 인식하지 못하고, text/html에는 <pre>도 없이 줄별 <div>로만 담겨 네이티브 붙여넣기 시
        // 줄마다 평문 문단으로 깨진다. 코드 에디터 클립보드 시그니처를 감지해 코드블록으로 복원한다.
        // 이미 코드블록 안이면 네이티브 붙여넣기(평문 삽입)에 맡긴다.
        const inCodeBlock = view.state.selection.$from.parent.type.name === 'codeBlock'
        const codeEditorPaste = inCodeBlock ? null : getCodeEditorPaste(event.clipboardData)
        if (codeEditorPaste) {
          const codeBlockType = view.state.schema.nodes.codeBlock
          if (codeBlockType) {
            event.preventDefault()
            const codeBlockNode = codeBlockType.create(
              { language: codeEditorPaste.language },
              view.state.schema.text(codeEditorPaste.code)
            )
            const slice = new Slice(Fragment.from(codeBlockNode), 0, 0)
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
            return true
          }
        }

        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false

        const pasteHtml = event.clipboardData?.getData('text/html') ?? ''

        // Excel/구글시트 등에서 복사한 표는 text/html에 <table>로 담겨 있다. 이때 text/plain(TSV)을
        // 마크다운 재파서에 넘기면 셀 내용이 목록/제목 등으로 오탐되어 표가 평문으로 깨지므로,
        // <table>이 있으면 네이티브 붙여넣기에 위임해 표 구조를 보존한다.
        if (hasPastedTable) return false

        // 우리 에디터(ProseMirror) 내부에서 복사한 콘텐츠는 text/html에 원본 구조와
        // data-pm-slice 마커가 담긴다. 평문 코드 휴리스틱보다 내부 리치 구조를 우선해야
        // 반복된 `=` 같은 일반 문서 내용이 전체 코드블록으로 오인되지 않는다.
        if (pasteHtml.includes('data-pm-slice')) return false

        // 내용이 소스 코드(또는 KQL 쿼리)로 보이면 코드블록으로 감싼다. 이렇게 하지 않으면 Python '#'
        // 주석이 마크다운 제목으로, 코드/쿼리 라인이 문단으로 오탐되어 깨진다. 내부 복사는 위에서 원본
        // ProseMirror 구조를 보존하므로, 이 휴리스틱은 외부/평문 붙여넣기에만 적용된다.
        if (!inCodeBlock && looksLikeSourceCode(text)) {
          const codeBlockType = view.state.schema.nodes.codeBlock
          if (codeBlockType) {
            event.preventDefault()
            const normalizedCode = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            const codeBlockNode = codeBlockType.create(
              { language: detectCodeLanguage(normalizedCode) },
              view.state.schema.text(normalizedCode)
            )
            const slice = new Slice(Fragment.from(codeBlockNode), 0, 0)
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
            return true
          }
        }

        const markdownPasteSlice = parseMarkdownPasteToSlice(view.state.schema, text)
        if (markdownPasteSlice) {
          event.preventDefault()
          view.dispatch(view.state.tr.replaceSelection(markdownPasteSlice).scrollIntoView())
          return true
        }

        return false
      },
      handleDOMEvents: {
        mousemove(view, event) {
          if (!editable) return false

          const isOnRowResizeHandle = Boolean(getRowResizeTarget(view, event))
          view.dom.classList.toggle('row-resize-cursor', isOnRowResizeHandle)

          return false
        },
        mouseleave(view) {
          view.dom.classList.remove('row-resize-cursor')

          return false
        },
        mousedown(view, event) {
          if (!editable) return false

          const target = getRowResizeTarget(view, event)
          if (!target) return false

          event.preventDefault()
          view.dom.classList.add('row-resize-cursor')
          target.row.classList.add('row-height-resizing')

          const startY = event.clientY
          const startHeight = Math.round(target.row.getBoundingClientRect().height)

          const updateRowHeight = (height: number) => {
            const rowNode = view.state.doc.nodeAt(target.rowPos)
            if (rowNode?.type.name !== 'tableRow') return

            const nextHeight = clampNumber(height, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT)
            target.row.style.height = `${nextHeight}px`
            view.dispatch(
              view.state.tr.setNodeMarkup(target.rowPos, undefined, {
                ...rowNode.attrs,
                rowHeight: nextHeight,
              }),
            )
          }

          const handleMouseMove = (moveEvent: MouseEvent) => {
            updateRowHeight(startHeight + moveEvent.clientY - startY)
          }

          const handleMouseUp = () => {
            target.row.classList.remove('row-height-resizing')
            view.dom.classList.remove('row-resize-cursor')
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
          }

          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)

          return true
        },
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (applyingContentRef.current) {
        debugSaveFlow('update ignored while applying content')
        return
      }

      const nextContent = activeEditor.getJSON() as Record<string, unknown>
      if (documentHasPendingImageUpload(nextContent)) {
        debugSaveFlow('update ignored while image upload is pending')
        return
      }

      const matchesLoadedContent = JSON.stringify(nextContent) === JSON.stringify(baselineContentRef.current)
      if (matchesLoadedContent) {
        debugSaveFlow('update ignored because content matches baseline', {
          isFocused: activeEditor.isFocused,
        })
        return
      }

      debugSaveFlow('update forwarded to autosave', {
        isFocused: activeEditor.isFocused,
        contentBlocks: Array.isArray(nextContent.content) ? nextContent.content.length : null,
      })
      onChangeRef.current(nextContent)
    },
  })

  useEffect(() => {
    editor?.setEditable(editable, false)
  }, [editable, editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const nextContent = resolvedContent
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(nextContent)) {
      // setContent 내부가 flushSync를 호출하므로, useEffect(React 렌더링 사이클) 밖으로 미룸
      const timer = window.setTimeout(() => {
        if (!editor.isDestroyed) {
          debugSaveFlow('applying prop content', {
            contentBlocks: Array.isArray(nextContent.content) ? nextContent.content.length : null,
          })
          applyingContentRef.current = true
          editor.commands.setContent(nextContent, { emitUpdate: false })
          window.requestAnimationFrame(() => {
            applyingContentRef.current = false
          })
        }
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [resolvedContent, editor])

  return (
    <div>
      <EditorContent editor={editor} />
    </div>
  )
}
