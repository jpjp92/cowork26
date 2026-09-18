// 짭비스 백엔드 실시간 WebSocket(/ws/hud) 스트림 통합 구독 훅임
import { useState, useEffect, useRef, useCallback } from 'react'
import { getJjapvisWsUrl } from '../../lib/jjapvis/config'
import type { JjapvisMediaItem, JjapvisThoughtStep } from '../../lib/jjapvis/types'

const MAX_THOUGHT_HISTORY = 40
const MAX_MEDIA_ITEMS = 50

interface UseJjapvisStreamProps {
  token: string
}

export function useJjapvisStream({ token }: UseJjapvisStreamProps) {
  const [isThinking, setIsThinking] = useState(false)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [thoughtHistory, setThoughtHistory] = useState<JjapvisThoughtStep[]>([])
  const [aiState, setAiState] = useState<string>('idle')
  const [mediaList, setMediaList] = useState<JjapvisMediaItem[]>([])
  const [latestMedia, setLatestMedia] = useState<JjapvisMediaItem | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const retryDelayRef = useRef(2000)
  const recentMediaKeysRef = useRef<Map<string, number>>(new Map())

  // 생각 및 미디어 초기화 함수임
  const clearThoughts = useCallback(() => {
    setThoughtHistory([])
    setCurrentStep('')
    setIsThinking(false)
  }, [])

  const clearMedia = useCallback(() => {
    setMediaList([])
    setLatestMedia(null)
  }, [])

  useEffect(() => {
    if (!token) return

    let isDisposed = false

    const connectWs = () => {
      if (isDisposed) return
      const wsUrl = getJjapvisWsUrl(token)

      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          retryDelayRef.current = 2000
        }

        ws.onmessage = (event) => {
          let msg: any
          try {
            msg = JSON.parse(event.data)
          } catch {
            return
          }

          if (!msg || msg.type !== 'hud') return
          const cmd = msg.cmd
          const arg = msg.arg

          // 1. 진행 상황 및 생각 과정 이벤트 처리함
          if (cmd === 'progress') {
            const rawText = typeof arg === 'string' ? arg : (arg?.text || '')
            const cleanText = rawText.replace(/^[^가-힣a-zA-Z0-9\[\(]+/, '').trim()
            if (!cleanText) return

            const isBg = !!(arg && typeof arg === 'object' && arg.is_background)
            const newStep: JjapvisThoughtStep = {
              id: `th_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              text: cleanText,
              timestamp: Date.now(),
              is_background: isBg,
              status: 'running',
            }

            setIsThinking(true)
            if (!isBg) {
              setCurrentStep(cleanText)
            }

            setThoughtHistory((prev) => {
              // 동일한 텍스트 중복 방지함
              if (prev.length > 0 && prev[prev.length - 1].text === cleanText) {
                return prev
              }
              const updated = [...prev, newStep]
              return updated.length > MAX_THOUGHT_HISTORY
                ? updated.slice(updated.length - MAX_THOUGHT_HISTORY)
                : updated
            })
          } else if (cmd === 'progress_clear') {
            setIsThinking(false)
            setCurrentStep('')
          } else if (cmd === 'pipeline_progress') {
            // 파이프라인 단계별 진행 카드 이벤트 처리함
            const eventData = typeof arg === 'string' ? JSON.parse(arg) : arg
            if (!eventData) return

            const pTitle = eventData.title || eventData.message || `단계 ${eventData.step || 1}`
            const pStatus = eventData.status || 'running'
            const isDone = pStatus === 'pipeline_done' || pStatus === 'done'

            const stepRecord: JjapvisThoughtStep = {
              id: `pl_${eventData.job_id || 'def'}_${eventData.step || 1}`,
              text: `[공정] ${pTitle}`,
              timestamp: Date.now(),
              status: pStatus === 'error' ? 'error' : isDone ? 'done' : 'running',
              elapsedSec: eventData.elapsed_sec,
              is_background: !!eventData.is_background,
            }

            if (pStatus === 'pipeline_done') {
              setIsThinking(false)
            } else {
              setIsThinking(true)
              setCurrentStep(pTitle)
            }

            setThoughtHistory((prev) => {
              const existingIdx = prev.findIndex((s) => s.id === stepRecord.id)
              if (existingIdx >= 0) {
                const copy = [...prev]
                copy[existingIdx] = stepRecord
                return copy
              }
              const updated = [...prev, stepRecord]
              return updated.length > MAX_THOUGHT_HISTORY
                ? updated.slice(updated.length - MAX_THOUGHT_HISTORY)
                : updated
            })
          } else if (cmd === 'state') {
            // AI 두뇌 상태 업데이트함 (thinking, working, idle 등)
            const st = typeof arg === 'string' ? arg : (arg?.state || 'idle')
            setAiState(st)
            if (st === 'thinking' || st === 'working') {
              setIsThinking(true)
            } else if (st === 'idle') {
              // 자연스러운 전환을 위해 일정 시간 유지 후 해제함
              setTimeout(() => {
                setIsThinking(false)
              }, 1200)
            }
          }

          // 2. 미디어(이미지/동영상/차트/오디오) 이벤트 처리함
          else if (cmd === 'media') {
            if (!arg) return
            const mediaType = arg.type || 'image'
            const mediaData = arg.data || ''
            const caption = arg.caption || ''
            const isBg = !!arg.is_background
            const bgName = arg.bg_name || ''
            const link = arg.link || ''

            // 중복 수신 방지 캐시 검사함 (5초 이내 동일 미디어 차단)
            const key = `${mediaType}|${mediaData.slice(0, 100)}|${caption}`
            const now = Date.now()
            const lastSeen = recentMediaKeysRef.current.get(key)
            if (lastSeen && now - lastSeen < 5000) {
              return
            }
            recentMediaKeysRef.current.set(key, now)

            // 오래된 캐시 키 정리함
            if (recentMediaKeysRef.current.size > 50) {
              for (const [k, ts] of recentMediaKeysRef.current.entries()) {
                if (now - ts > 30000) recentMediaKeysRef.current.delete(k)
              }
            }

            const newMediaItem: JjapvisMediaItem = {
              id: `med_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              type: mediaType,
              data: mediaData,
              caption,
              timestamp: now,
              is_background: isBg,
              bg_name: bgName,
              link,
            }

            setLatestMedia(newMediaItem)
            setMediaList((prev) => {
              const updated = [newMediaItem, ...prev]
              return updated.length > MAX_MEDIA_ITEMS
                ? updated.slice(0, MAX_MEDIA_ITEMS)
                : updated
            })
          }

          // 3. 파일 다운로드 이벤트 브리지함
          else if (cmd === 'save_file') {
            if (arg && arg.b64_data && arg.filename) {
              try {
                const byteChars = atob(arg.b64_data)
                const byteNumbers = new Array(byteChars.length)
                for (let i = 0; i < byteChars.length; i++) {
                  byteNumbers[i] = byteChars.charCodeAt(i)
                }
                const byteArray = new Uint8Array(byteNumbers)
                const blob = new Blob([byteArray], { type: 'application/octet-stream' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.download = arg.filename
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                setTimeout(() => URL.revokeObjectURL(link.href), 1000)
              } catch (err) {
                console.error('[JjapvisStream] 파일 다운로드 실패함:', err)
              }
            }
          }

          // 4. 웹 화면 팝업 이벤트 브리지함
          else if (cmd === 'open_web' || cmd === 'open_url') {
            const targetUrl = (arg && arg.url) || (typeof arg === 'string' ? arg : '')
            if (targetUrl) {
              try {
                window.open(targetUrl, '_blank', 'noopener,noreferrer')
              } catch (e) {
                console.warn('[JjapvisStream] window.open 차단됨:', e)
              }
            }
          }
        }

        ws.onclose = () => {
          wsRef.current = null
          if (!isDisposed) {
            retryTimerRef.current = setTimeout(connectWs, retryDelayRef.current)
            retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, 30000)
          }
        }

        ws.onerror = () => {
          wsRef.current = null
        }
      } catch (err) {
        if (!isDisposed) {
          retryTimerRef.current = setTimeout(connectWs, retryDelayRef.current)
        }
      }
    }

    connectWs()

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
  }, [token])

  return {
    isThinking,
    currentStep,
    thoughtHistory,
    aiState,
    mediaList,
    latestMedia,
    clearThoughts,
    clearMedia,
  }
}
