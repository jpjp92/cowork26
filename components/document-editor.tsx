'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
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

const tableButtonClass = 'rounded-[8px] border border-black bg-[#f3ede4] px-3 py-2 text-xs font-black text-[#1d1c16] shadow-[2px_2px_0_#000] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0'

export default function DocumentEditor({ content, editable, onChange }: DocumentEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
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
      {editable && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={tableButtonClass}
            type="button"
            onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            disabled={!editor}
          >
            표 추가
          </button>
          <button
            className={tableButtonClass}
            type="button"
            onClick={() => editor?.chain().focus().addColumnAfter().run()}
            disabled={!editor?.can().addColumnAfter()}
          >
            열 +
          </button>
          <button
            className={tableButtonClass}
            type="button"
            onClick={() => editor?.chain().focus().addRowAfter().run()}
            disabled={!editor?.can().addRowAfter()}
          >
            행 +
          </button>
          <button
            className={tableButtonClass}
            type="button"
            onClick={() => editor?.chain().focus().deleteColumn().run()}
            disabled={!editor?.can().deleteColumn()}
          >
            열 -
          </button>
          <button
            className={tableButtonClass}
            type="button"
            onClick={() => editor?.chain().focus().deleteRow().run()}
            disabled={!editor?.can().deleteRow()}
          >
            행 -
          </button>
          <button
            className={tableButtonClass}
            type="button"
            onClick={() => editor?.chain().focus().deleteTable().run()}
            disabled={!editor?.can().deleteTable()}
          >
            표 삭제
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
