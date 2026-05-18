'use client'

import { Mark, mergeAttributes } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import { useEffect } from 'react'

interface DocumentEditorProps {
  content: Record<string, unknown> | null
  editable: boolean
  onChange: (content: Record<string, unknown>) => void
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

  if (dividerIndex === -1) return null

  const tableLines = [lines[dividerIndex - 1], lines[dividerIndex]]
  for (const line of lines.slice(dividerIndex + 1)) {
    if (!line.includes('|')) break
    tableLines.push(line)
  }

  const toCells = (line: string) => line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

  const headers = toCells(tableLines[0])
  const rows = tableLines.slice(2).map(toCells)
  if (!headers.length || rows.some(row => row.length !== headers.length)) return null

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const headerHtml = headers.map(cell => `<th><p>${escapeHtml(cell)}</p></th>`).join('')
  const rowsHtml = rows
    .map(row => `<tr>${row.map(cell => `<td><p>${escapeHtml(cell)}</p></td>`).join('')}</tr>`)
    .join('')

  return `<table><tbody><tr>${headerHtml}</tr>${rowsHtml}</tbody></table>`
}

export default function DocumentEditor({ content, editable, onChange }: DocumentEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit,
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
    content: content ?? {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none',
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false

        const tableHtml = parseMarkdownTable(text)
        if (!tableHtml) return false

        event.preventDefault()
        const wrapper = document.createElement('div')
        wrapper.innerHTML = tableHtml
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(wrapper)
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
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
      onChange(activeEditor.getJSON() as Record<string, unknown>)
    },
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const nextContent = content ?? { type: 'doc', content: [{ type: 'paragraph' }] }
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(nextContent)) {
      editor.commands.setContent(nextContent)
    }
  }, [content, editor])

  return (
    <div>
      <EditorContent editor={editor} />
    </div>
  )
}
