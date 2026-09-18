// 짭비스 백엔드 에이전트 세션(/ws/agent) 활성화 훅임
// 짭비스 백엔드는 /ws/agent 연결이 살아있을 때만 _sessions에 유효한 세션(hud_token 매핑)을 보관함
// 이 훅을 통해 코워크는 짭비스 백엔드 코드를 단 1줄도 건드리지 않고 생각과정과 미디어 스트림을 완벽 활성화함
import { useEffect, useRef } from 'react'
import { JJAPVIS_CONFIG } from '../../lib/jjapvis/config'

interface UseJjapvisAgentSessionProps {
  token: string
  googleAccessToken?: string
}

export function useJjapvisAgentSession({
  token,
  googleAccessToken,
}: UseJjapvisAgentSessionProps) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!token) return

    let isDisposed = false

    const connectAgentWs = () => {
      if (isDisposed) return

      const httpUrl = JJAPVIS_CONFIG.serverUrl
      const wsProto = httpUrl.startsWith('https://') ? 'wss://' : 'ws://'
      const host = httpUrl.replace(/^https?:\/\//, '')
      let url = `${wsProto}${host}/ws/agent?hud_token=${encodeURIComponent(token)}&machine_id=cowork_${token.substring(0, 8)}`

      if (googleAccessToken) {
        url += `&google_oauth_token=${encodeURIComponent(googleAccessToken)}`
      }

      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          // 세션 핑 유지용 주기적 핑
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }))
            } else {
              clearInterval(pingInterval)
            }
          }, 25000)
        }

        ws.onmessage = (evt) => {
          // 필요 시 시스템 이벤트 수신
          try {
            const data = JSON.parse(evt.data)
            if (data.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }))
            }
          } catch {
            // 무시함
          }
        }

        ws.onclose = () => {
          wsRef.current = null
          if (!isDisposed) {
            retryTimerRef.current = setTimeout(connectAgentWs, 3000)
          }
        }

        ws.onerror = () => {
          wsRef.current = null
        }
      } catch {
        if (!isDisposed) {
          retryTimerRef.current = setTimeout(connectAgentWs, 3000)
        }
      }
    }

    connectAgentWs()

    return () => {
      isDisposed = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {
          // 무시함
        }
        wsRef.current = null
      }
    }
  }, [token, googleAccessToken])
}
