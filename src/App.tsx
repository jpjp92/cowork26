import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthForm from './components/AuthForm'
import SheetList from './components/SheetList'
import SheetEditor from './components/SheetEditor'
import InviteModal from './components/InviteModal'
import { Sheet } from './hooks/useSheets'

export default function App() {
  const { session, loading, signOut } = useAuth()
  const [activeSheet, setActiveSheet] = useState<Sheet | null>(null)
  const [showInvite, setShowInvite] = useState(false)

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
      <header className="bg-white border-b px-6 py-3 flex justify-between items-center h-14">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg text-gray-800">Cowork26</span>
          {activeSheet && (
            <span className="text-gray-400 text-sm truncate max-w-48">{activeSheet.title}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeSheet && (
            <>
              <button
                onClick={() => setShowInvite(true)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                공유
              </button>
              <button
                onClick={() => setActiveSheet(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← 목록
              </button>
            </>
          )}
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-red-500"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className={activeSheet ? '' : 'bg-gray-50 min-h-[calc(100vh-56px)]'}>
        {activeSheet
          ? <SheetEditor sheet={activeSheet} />
          : <SheetList onOpen={setActiveSheet} accessToken={session.access_token} />
        }
      </main>

      {showInvite && activeSheet && (
        <InviteModal sheetId={activeSheet.id} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
