import { useState } from 'react'
import { Sheet, useSheets } from '../hooks/useSheets'

interface Props {
  onOpen: (sheet: Sheet) => void
  accessToken: string
}

export default function SheetList({ onOpen, accessToken }: Props) {
  const { sheets, loading, error, createSheet, deleteSheet, refetch } = useSheets(accessToken)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState('')

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    setActionError('')
    try {
      const sheet = await createSheet(title.trim())
      setTitle('')
      onOpen(sheet)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '시트를 만들지 못했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('이 시트를 삭제할까요?')) return
    setActionError('')
    try {
      await deleteSheet(id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '시트를 삭제하지 못했습니다.')
    }
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
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          <p className="mt-1 text-xs text-red-500">
            로컬에서는 Vercel Functions까지 실행해야 합니다. `npm run dev` 대신 `npx vercel dev`로 확인하세요.
          </p>
          <button
            onClick={refetch}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            다시 시도
          </button>
        </div>
      )}
      {actionError && <p className="mb-4 text-sm text-red-500">{actionError}</p>}
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
