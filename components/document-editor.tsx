'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'

interface DocumentEditorProps {
  content: Record<string, unknown> | null
  editable: boolean
  onChange: (content: Record<string, unknown>) => void
}

export default function DocumentEditor({ content, editable, onChange }: DocumentEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit,
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

  return <EditorContent editor={editor} />
}
