'use client'

import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import { createLowlight, common } from 'lowlight'
import mermaid from 'mermaid'
import { useCallback, useEffect, useRef, useState } from 'react'

const lowlight = createLowlight(common)

mermaid.initialize({ startOnLoad: false, theme: 'dark' })

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
    mermaid.render(id, code)
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
}

const EMPTY_DOC_CONTENT: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}
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

export default function DocumentEditor({ content, editable, onChange }: DocumentEditorProps) {
  const resolvedContent = content ?? EMPTY_DOC_CONTENT
  const onChangeRef = useRef(onChange)
  const baselineContentRef = useRef(resolvedContent)
  const applyingContentRef = useRef(false)
  baselineContentRef.current = resolvedContent

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockWithLang,
      MermaidBlock,
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
        placeholder: '자료를 붙여넣고, 회의 내용을 정리하고, 함께 편집하세요...',
      }),
    ],
    content: resolvedContent,
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none',
      },
      handlePaste(view, event) {
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
