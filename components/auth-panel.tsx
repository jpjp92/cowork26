'use client'

import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase-browser'

export default function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) setError(signInError.message)
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (data.session) {
        setMessage('회원가입이 완료되었습니다.')
      } else {
        setMode('login')
        setPassword('')
        setMessage('가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인해주세요.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#777773] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[390px] border-2 border-black bg-[#50504d] p-7 text-white shadow-[6px_6px_0_#000]"
      >
        <div className="mb-7">
          <div className="mb-4 flex h-11 w-11 items-center justify-center border-2 border-black bg-[#baf7c8] text-sm font-black text-black shadow-[3px_3px_0_#000]">
            C
          </div>
          <h1 className="text-3xl font-black uppercase text-white">Cowork26</h1>
          <p className="mt-2 border-l-2 border-black pl-3 text-sm font-bold leading-6 text-neutral-100">
            팀 문서를 함께 만들고 정리하는 brutal Notion-lite 협업 공간
          </p>
        </div>

        <div className="space-y-3">
          {mode === 'signup' && (
            <input
              className="w-full border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black outline-none placeholder:text-[#777] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
              placeholder="이름"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              required
            />
          )}
          <input
            className="w-full border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black outline-none placeholder:text-[#777] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
            placeholder="이메일"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
          />
          <input
            className="w-full border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black outline-none placeholder:text-[#777] focus:-translate-y-0.5 focus:shadow-[3px_3px_0_#000]"
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
          />
        </div>

        {message && (
          <p className="mt-4 border-2 border-black bg-[#baf7c8] px-3 py-2 text-sm font-bold text-black">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 border-2 border-black bg-red-300 px-3 py-2 text-sm font-bold text-black">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full border-2 border-black bg-[#baf7c8] px-4 py-2.5 text-sm font-black uppercase text-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#000] disabled:opacity-50"
        >
          {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
        </button>

        <p className="mt-5 text-center text-sm font-bold text-white">
          {mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}{' '}
          <button
            type="button"
            className="font-black text-[#baf7c8] underline decoration-2 underline-offset-4"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setMessage('')
              setError('')
            }}
          >
            {mode === 'login' ? '회원가입' : '로그인'}
          </button>
        </p>
      </form>
    </main>
  )
}
