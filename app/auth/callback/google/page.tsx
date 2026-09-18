'use client'

// 구글 OAuth 팝업 인증 콜백 수신 및 부모 창 토큰 전달 페이지임
import { useEffect, useState } from 'react'

export default function GoogleAuthCallbackPage() {
  const [status, setStatus] = useState('구글 인증 정보 확인 중...')

  useEffect(() => {
    if (typeof window === 'undefined') return

    // URL 해시(#access_token=...&token_type=Bearer&expires_in=...) 파싱함
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const expiresIn = params.get('expires_in') || '3600'
    const error = params.get('error')

    if (error) {
      setStatus(`인증 오류 발생: ${error}`)
      setTimeout(() => window.close(), 2000)
      return
    }

    if (accessToken && window.opener) {
      // 부모 창으로 액세스 토큰 전달함
      window.opener.postMessage(
        {
          type: 'google_oauth_token',
          accessToken,
          expiresIn,
        },
        window.location.origin
      )
      setStatus('인증 성공! 창을 닫습니다...')
      setTimeout(() => window.close(), 500)
    } else {
      setStatus('인증 토큰이 없거나 부모 창이 닫혔습니다.')
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d1117] text-white p-6 font-mono text-center">
      <div className="w-10 h-10 border-4 border-[#5eead4]/20 border-t-[#5eead4] rounded-full animate-spin mb-4" />
      <p className="text-sm text-[#5eead4] animate-pulse">{status}</p>
    </div>
  )
}
