import { useState } from 'react'
import { Sheet, useSheets } from '../hooks/useSheets'

interface Props {
  onOpen: (sheet: Sheet) => void
}

export default function SheetList({ onOpen }: Props) {
  const { sheets, loading, createSheet, deleteSheet } = useSheets()
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    const sheet = await createSheet(title.trim())
    setTitle('')
    setCreating(false)
    onOpen(sheet)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('이 시트를 삭제할까요?')) return
    await deleteSheet(id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-gray-400">
        불러오는 중...
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-xl font-bold mb-6 text-gray-800">내 시트</h2>
      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="새 시트 이름"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !title.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {creating ? '만드는 중...' : '+ 새 시트'}
        </button>
      </div>
      <ul className="space-y-2">
        {sheets.map(sheet => (
          <li
            key={sheet.id}
            onClick={() => onOpen(sheet)}
            className="border rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center group transition-colors"
          >
            <div>
              <p className="font-medium text-gray-800">{sheet.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(sheet.updated_at).toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </p>
            </div>
            <button
              onClick={e => handleDelete(e, sheet.id)}
              className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-2"
              title="삭제"
            >
              ✕
            </button>
          </li>
        ))}
        {sheets.length === 0 && (
          <li className="text-center text-gray-400 text-sm py-12">
            시트가 없어요. 새 시트를 만들어보세요.
          </li>
        )}
      </ul>
    </div>
  )
}
