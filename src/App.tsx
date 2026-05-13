import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthForm from './components/AuthForm'

export default function App() {
  const { session, loading, signOut } = useAuth()
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        로딩 중...
      </div>
    )
  }

  if (!session) return <AuthForm />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex justify-between items-center">
        <span className="font-bold text-lg text-gray-800">Cowork26</span>
        <div className="flex gap-4 items-center">
          {activeSheetId && (
            <button
              onClick={() => setActiveSheetId(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← 목록
            </button>
          )}
          <button
            onClick={signOut}
            className="text-sm text-red-500 hover:text-red-700"
          >
            로그아웃
          </button>
        </div>
      </header>
      <main>
        <div className="p-8 text-center text-gray-400">
          시트 목록 구현 예정 (Task 5)
        </div>
      </main>
    </div>
  )
}
