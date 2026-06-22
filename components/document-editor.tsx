'use client'

import { Extension, InputRule, Mark, Node, mergeAttributes } from '@tiptap/core'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
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
import { useCallback, useEffect, useRef, useState } from 'react'

const lowlight = createLowlight(common)

type MermaidApi = typeof import('mermaid').default

let mermaidPromise: Promise<MermaidApi> | null = null

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(module => {
    module.default.initialize({ startOnLoad: false, theme: 'dark' })
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

function parseMarkdownCodeBlock(text: string): { language: string | null; code: string } | null {
  const match = text.trim().match(/^```(\w*)\r?\n([\s\S]*?)\n?```\s*$/)
  if (!match) return null
  return {
    language: match[1].trim() || null,
    code: match[2] ?? '',
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function parseMarkdownLinksToHtml(text: string) {
  const markdownLinkPattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g
  if (!markdownLinkPattern.test(text)) return null

  const renderLine = (line: string) => {
    markdownLinkPattern.lastIndex = 0
    let html = ''
    let cursor = 0
    let match: RegExpExecArray | null

    while ((match = markdownLinkPattern.exec(line))) {
      const [raw, label, href] = match
      html += escapeHtml(line.slice(cursor, match.index))
      html += `<a href="${escapeHtml(href)}" class="url-chip" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      cursor = match.index + raw.length
    }

    html += escapeHtml(line.slice(cursor))
    return html
  }

  const paragraphs = text.split(/\n{2,}/).map(paragraph => {
    const lines = paragraph.split(/\n/)
    const htmlLines = lines.map(renderLine)

    return `<p>${htmlLines.join('<br>')}</p>`
  })

  return paragraphs.join('')
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

function parseMarkdownTable(text: string) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('```'))

  if (lines.length < 2) return null

  const dividerPattern = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/
  const dividerIndex = lines.findIndex((line, index) => (
    index > 0 && line.includes('|') && dividerPattern.test(line) && lines[index - 1]?.includes('|')
  ))

  const toCells = (line: string) => line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

  let headers: string[]
  let rows: string[][]

  if (dividerIndex !== -1) {
    const tableLines = [lines[dividerIndex - 1], lines[dividerIndex]]
    for (const line of lines.slice(dividerIndex + 1)) {
      if (!line.includes('|')) break
      tableLines.push(line)
    }
    headers = toCells(tableLines[0])
    rows = tableLines.slice(2).map(toCells)
  } else {
    // No markdown divider row (---|---): accept plain pipe-separated table
    const firstPipeIdx = lines.findIndex(line => line.includes('|'))
    if (firstPipeIdx === -1) return null

    const pipeLines: string[] = []
    for (const line of lines.slice(firstPipeIdx)) {
      if (!line.includes('|')) break
      pipeLines.push(line)
    }

    if (pipeLines.length < 2) return null

    headers = toCells(pipeLines[0])
    rows = pipeLines.slice(1).map(toCells)
  }

  if (!headers.length || rows.some(row => row.length !== headers.length)) return null

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const renderInlineMarkdown = (value: string) => {
    const htmlTokens: string[] = []
    const stash = (html: string) => {
      const tokenIndex = htmlTokens.push(html) - 1
      return `__INLINE_TOKEN_${tokenIndex}__`
    }

    let escaped = escapeHtml(value)

    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, href) => (
      stash(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    ))

    escaped = escaped.replace(/`([^`]+)`/g, (_match, code) => stash(`<code>${code}</code>`))
    // __bold__ must run before **bold** to prevent the **bold** stash token (__INLINE_TOKEN_N__) being consumed by __...__
    escaped = escaped.replace(/__(.+?)__/g, (_match, strong) => stash(`<strong>${strong}</strong>`))
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, (_match, strong) => stash(`<strong>${strong}</strong>`))
    escaped = escaped.replace(/~~(.+?)~~/g, (_match, strike) => stash(`<s>${strike}</s>`))
    escaped = escaped.replace(/(^|[\s(])\*(?!\*)([^*\n]+?)\*(?!\*)/g, (_match, prefix, emphasis) => (
      `${prefix}${stash(`<em>${emphasis}</em>`)}`
    ))
    escaped = escaped.replace(/(^|[\s(])_(?!_)([^_\n]+?)_(?!_)/g, (_match, prefix, emphasis) => (
      `${prefix}${stash(`<em>${emphasis}</em>`)}`
    ))

    return escaped.replace(/__INLINE_TOKEN_(\d+)__/g, (_match, tokenIndex) => htmlTokens[Number(tokenIndex)] ?? '')
  }

  const headerHtml = headers.map(cell => `<th><p>${renderInlineMarkdown(cell)}</p></th>`).join('')
  const rowsHtml = rows
    .map(row => `<tr>${row.map(cell => `<td><p>${renderInlineMarkdown(cell)}</p></td>`).join('')}</tr>`)
    .join('')

  return `<table><tbody><tr>${headerHtml}</tr>${rowsHtml}</tbody></table>`
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
  const image = wrapper.querySelector<HTMLImageElement>('img[data-cowork26-image="true"], img[data-storage-path]')
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
  const resolvedContent = content ?? EMPTY_DOC_CONTENT
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
        const imageFile = Array
          .from(event.clipboardData?.items ?? [])
          .find(item => item.type.startsWith('image/'))
          ?.getAsFile()

        if (imageFile && onUploadImageRef.current) {
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

        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false

        const tableHtml = parseMarkdownTable(text)
        if (tableHtml) {
          event.preventDefault()
          const wrapper = document.createElement('div')
          wrapper.innerHTML = tableHtml
          const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(wrapper)
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
          return true
        }

        const codeBlock = parseMarkdownCodeBlock(text)
        if (codeBlock) {
          event.preventDefault()
          const { schema } = view.state
          if (codeBlock.language === 'mermaid') {
            const mermaidBlockType = schema.nodes.mermaidBlock
            if (!mermaidBlockType) return false
            const node = mermaidBlockType.create({ code: codeBlock.code })
            view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
            return true
          }
          const codeBlockType = schema.nodes.codeBlock
          if (!codeBlockType) return false
          const content = codeBlock.code ? [schema.text(codeBlock.code)] : []
          const node = codeBlockType.create({ language: codeBlock.language }, content)
          view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
          return true
        }

        const markdownLinkHtml = parseMarkdownLinksToHtml(text)
        if (markdownLinkHtml) {
          event.preventDefault()
          const wrapper = document.createElement('div')
          wrapper.innerHTML = markdownLinkHtml
          const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(wrapper)
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
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
