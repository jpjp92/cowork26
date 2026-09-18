'use client'

// 구글 OAuth 팝업 인증 콜백 수신 및 부모 창 토큰 전달 페이지임
import { useEffect, useState } from 'react'

export default function GoogleAuthCallbackPage() {
  const [status, setStatus] = useState('구글 인증 정보 확인 중...')

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. URL 쿼리 파라미터(?code=... 또는 ?error=...) 확인함
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    const errorParam = searchParams.get('error')

    // 2. 하위 호환: URL 해시(#access_token=...) 확인함
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const hashToken = hashParams.get('access_token')

    if (errorParam) {
      setStatus(`구글 인증 오류: ${errorParam}`)
      setTimeout(() => window.close(), 2500)
      return
    }

    if (code) {
      setStatus('구글 인가 코드 수신 완료. 토큰 교환 중...')
      const redirectUri = `${window.location.origin}/auth/callback/google`

      fetch('/api/jjapvis/auth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.accessToken) {
            if (window.opener) {
              window.opener.postMessage(
                {
                  type: 'google_oauth_token',
                  accessToken: data.accessToken,
                  email: data.email,
                  expiresIn: data.expiresIn,
                },
                window.location.origin
              )
            }
            setStatus(`인증 성공! (${data.email}) 창을 닫습니다...`)
            setTimeout(() => window.close(), 800)
          } else {
            setStatus(`토큰 교환 실패: ${data.error || '알 수 없는 오류'}`)
            setTimeout(() => window.close(), 3000)
          }
        })
        .catch((err) => {
          setStatus(`서버 통신 실패: ${err.message}`)
          setTimeout(() => window.close(), 3000)
        })
      return
    }

    if (hashToken && window.opener) {
      window.opener.postMessage(
        {
          type: 'google_oauth_token',
          accessToken: hashToken,
          expiresIn: hashParams.get('expires_in') || '3600',
        },
        window.location.origin
      )
      setStatus('인증 성공! 창을 닫습니다...')
      setTimeout(() => window.close(), 500)
      return
    }

    setStatus('인증 코드 또는 토큰이 감지되지 않았습니다.')
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d1117] text-white p-6 font-mono text-center">
      <div className="w-10 h-10 border-4 border-[#5eead4]/20 border-t-[#5eead4] rounded-full animate-spin mb-4" />
      <p className="text-sm text-[#5eead4] animate-pulse">{status}</p>
    </div>
  )
}
