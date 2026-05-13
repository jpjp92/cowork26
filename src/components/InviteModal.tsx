import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  sheetId: string
  onClose: () => void
}

export default function InviteModal({ sheetId, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleInvite = async () => {
    if (!email.trim()) return
    setStatus('loading')
    const { data } = await supabase.auth.getSession()
    const res = await fetch(`/api/sheets/${sheetId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token}`,
      },
      body: JSON.stringify({ email: email.trim(), role }),
    })
    if (res.ok) {
      setStatus('success')
      setEmail('')
    } else {
      const err = await res.json()
      setErrorMsg(err.error ?? '오류가 발생했습니다')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
        <h3 className="font-bold text-lg text-gray-800">공동 작업자 초대</h3>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="이메일 주소"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleInvite()}
        />
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={role}
          onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
        >
          <option value="editor">편집자</option>
          <option value="viewer">뷰어</option>
        </select>
        {status === 'success' && (
          <p className="text-green-600 text-sm">✓ 초대 완료!</p>
        )}
        {status === 'error' && (
          <p className="text-red-500 text-sm">{errorMsg}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleInvite}
            disabled={status === 'loading' || !email.trim()}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {status === 'loading' ? '초대 중...' : '초대'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50 text-gray-600"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
