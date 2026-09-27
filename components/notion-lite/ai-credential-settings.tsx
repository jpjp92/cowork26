'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { notionLiteApi } from '../../lib/notion-lite/api'
import type { AiCredentialProvider, AiCredentialStatus } from '../../lib/notion-lite/types'

const PROVIDERS: Array<{
  id: AiCredentialProvider
  title: string
  description: string
  placeholder: string
  accentClass: string
  cardClass: string
  focusRingClass: string
}> = [
  {
    id: 'openai',
    title: '내 OpenAI API 키',
    description: '내 계정의 키로 문서를 분석합니다.',
    placeholder: 'OpenAI API key',
    accentClass: 'bg-[#baf7c8]',
    cardClass: 'border-l-[5px] border-l-[#baf7c8] bg-[#59635b]',
    focusRingClass: 'focus-visible:ring-[#baf7c8]',
  },
  {
    id: 'gemini',
    title: '내 Gemini API 키',
    description: 'Google AI Studio에서 사용 범위를 제한한 키를 권장합니다.',
    placeholder: 'Gemini API key',
    accentClass: 'bg-[#c4b5fd]',
    cardClass: 'border-l-[5px] border-l-[#c4b5fd] bg-[#5c5968]',
    focusRingClass: 'focus-visible:ring-[#c4b5fd]',
  },
]

function formatVerifiedAt(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function CredentialCard({
  accessToken,
  provider,
  title,
  description,
  placeholder,
  accentClass,
  cardClass,
  focusRingClass,
  initialStatus,
  onStatusChange,
}: {
  accessToken: string
  provider: AiCredentialProvider
  title: string
  description: string
  placeholder: string
  accentClass: string
  cardClass: string
  focusRingClass: string
  initialStatus?: AiCredentialStatus
  onStatusChange: (status: AiCredentialStatus) => void
}) {
  const [status, setStatus] = useState<AiCredentialStatus | null>(initialStatus ?? null)
  const [loading, setLoading] = useState(!initialStatus)
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const mutationControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setApiKey('')
    setEditing(false)
    setSaving(false)
    setDeleting(false)
    setConfirmDelete(false)
    setError('')
    if (initialStatus) {
      setStatus(initialStatus)
      setLoading(false)
      return () => mutationControllerRef.current?.abort()
    }
    setLoading(true)
    notionLiteApi.getAiCredentialStatus(accessToken, provider, controller.signal)
      .then(nextStatus => {
        setStatus(nextStatus)
        onStatusChange(nextStatus)
      })
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'AI 연결 상태를 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
      mutationControllerRef.current?.abort()
    }
  }, [accessToken, initialStatus, onStatusChange, provider])

  useEffect(() => {
    if (editing) inputRef.current?.focus({ preventScroll: true })
  }, [editing])

  const startEditing = () => {
    setApiKey('')
    setError('')
    setConfirmDelete(false)
    setEditing(true)
  }

  const cancelEditing = () => {
    setApiKey('')
    setError('')
    setEditing(false)
  }

  const connect = async () => {
    if (!apiKey.trim() || saving) return
    const keyForRequest = apiKey
    setApiKey('')
    setError('')
    setSaving(true)
    const controller = new AbortController()
    mutationControllerRef.current?.abort()
    mutationControllerRef.current = controller
    try {
      const nextStatus = await notionLiteApi.connectAiCredential(
        accessToken,
        provider,
        keyForRequest,
        controller.signal,
      )
      setStatus(nextStatus)
      onStatusChange(nextStatus)
      setEditing(false)
    } catch (saveError) {
      if (!controller.signal.aborted) {
        setError(saveError instanceof Error ? saveError.message : 'AI API 키를 연결하지 못했습니다.')
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false)
      if (mutationControllerRef.current === controller) mutationControllerRef.current = null
    }
  }

  const remove = async () => {
    if (deleting) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      setError('')
      return
    }
    setApiKey('')
    setDeleting(true)
    const controller = new AbortController()
    mutationControllerRef.current?.abort()
    mutationControllerRef.current = controller
    try {
      await notionLiteApi.deleteAiCredential(accessToken, provider, controller.signal)
      const nextStatus: AiCredentialStatus = { provider, connected: false }
      setStatus(nextStatus)
      onStatusChange(nextStatus)
      setEditing(false)
      setConfirmDelete(false)
      setError('')
    } catch (deleteError) {
      if (!controller.signal.aborted) {
        setError(deleteError instanceof Error ? deleteError.message : 'AI API 키 연결을 삭제하지 못했습니다.')
      }
    } finally {
      if (!controller.signal.aborted) setDeleting(false)
      if (mutationControllerRef.current === controller) mutationControllerRef.current = null
    }
  }

  const inputId = `ai-credential-${provider}`
  const descriptionId = `${inputId}-description`
  const busy = saving || deleting
  const verifiedAt = formatVerifiedAt(status?.verifiedAt)

  return (
    <article className={`rounded-[8px] border border-black p-3 ${cardClass}`} aria-busy={loading || busy}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-black text-white">{title}</h3>
          <p id={descriptionId} className="mt-1 text-[11px] font-medium leading-relaxed text-neutral-200">
            {description}
          </p>
        </div>
        {status?.connected && !loading && (
          <span className={`shrink-0 rounded border border-black px-1.5 py-0.5 text-[10px] font-black text-black ${accentClass}`}>
            연결됨
          </span>
        )}
      </div>

      {loading ? (
        <p role="status" className="mt-3 text-xs font-bold text-neutral-200">연결 상태 확인 중...</p>
      ) : !editing ? (
        status?.connected ? (
          <div className="mt-3">
            <p className="text-xs font-bold text-white">
              저장된 키 <span className="font-black tracking-wider">•••• {status.keyLastFour}</span>
            </p>
            {verifiedAt && <p className="mt-1 text-[11px] text-neutral-200">마지막 확인 {verifiedAt}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={startEditing}
                disabled={busy}
                className="min-h-11 rounded-[8px] border border-black bg-[#fde68a] px-2 text-xs font-black text-black shadow-[2px_2px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 md:min-h-9"
              >교체</button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className={`min-h-11 rounded-[8px] border border-black px-2 text-xs font-black shadow-[2px_2px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 md:min-h-9 ${
                  confirmDelete ? 'bg-red-200 text-black' : 'bg-[#50504d] text-white'
                }`}
              >{deleting ? '삭제 중...' : confirmDelete ? '한 번 더 눌러 삭제' : '삭제'}</button>
            </div>
            {confirmDelete && !deleting && (
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="mt-2 min-h-11 w-full text-xs font-bold text-neutral-100 underline underline-offset-2 md:min-h-8"
              >삭제 취소</button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className={`mt-3 min-h-11 w-full rounded-[8px] border border-black px-2 text-xs font-black text-black shadow-[2px_2px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:min-h-9 ${accentClass}`}
          >연결하기</button>
        )
      ) : (
        <form
          className="mt-3"
          onSubmit={event => {
            event.preventDefault()
            connect()
          }}
        >
          <label htmlFor={inputId} className="sr-only">{title}</label>
          <input
            ref={inputRef}
            id={inputId}
            type="password"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
            placeholder={placeholder}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            aria-describedby={descriptionId}
            className={`h-11 w-full rounded-[8px] border border-black bg-white px-2.5 text-base font-bold text-black outline-none placeholder:text-[#666] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#50504d] disabled:opacity-60 md:h-9 md:text-sm ${focusRingClass}`}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={!apiKey.trim() || busy}
              className={`min-h-11 rounded-[8px] border border-black px-2 text-xs font-black text-black shadow-[2px_2px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 md:min-h-9 ${accentClass}`}
            >{saving ? '확인 중...' : status?.connected ? '새 키 연결' : '연결 확인'}</button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={busy}
              className="min-h-11 rounded-[8px] border border-black bg-[#50504d] px-2 text-xs font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 md:min-h-9"
            >취소</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-2 text-xs font-bold leading-relaxed text-red-200">{error}</p>}
    </article>
  )
}

export function AiCredentialSettings({ accessToken }: { accessToken: string }) {
  const [expanded, setExpanded] = useState(false)
  const [statuses, setStatuses] = useState<Partial<Record<AiCredentialProvider, AiCredentialStatus>>>({})
  const [summaryLoading, setSummaryLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setExpanded(false)
    setStatuses({})
    setSummaryLoading(true)
    Promise.allSettled(PROVIDERS.map(provider => (
      notionLiteApi.getAiCredentialStatus(accessToken, provider.id, controller.signal)
    ))).then(results => {
      if (controller.signal.aborted) return
      const next: Partial<Record<AiCredentialProvider, AiCredentialStatus>> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[PROVIDERS[index].id] = result.value
      })
      setStatuses(next)
      setSummaryLoading(false)
    })
    return () => controller.abort()
  }, [accessToken])

  const updateStatus = useCallback((status: AiCredentialStatus) => {
    setStatuses(previous => ({ ...previous, [status.provider]: status }))
  }, [])
  const connectedCount = Object.values(statuses).filter(status => status?.connected).length
  const loadedStatusCount = Object.keys(statuses).length
  const summaryLabel = summaryLoading
    ? '확인 중'
    : loadedStatusCount === 0
      ? '확인 실패'
      : `${connectedCount}/2 연결`

  return (
    <section aria-labelledby="ai-connection-heading" className="mt-3 border-t border-black pt-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="ai-credential-settings-content"
        onClick={() => setExpanded(value => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span>
          <span id="ai-connection-heading" className="block text-[11px] font-black uppercase text-neutral-100">AI 연결</span>
          <span className="mt-0.5 block text-[11px] font-medium text-neutral-300">개인 API 키 관리</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded border border-black bg-[#baf7c8] px-1.5 py-0.5 text-[10px] font-black text-black">
            {summaryLabel}
          </span>
          <span aria-hidden="true" className={`text-sm font-black transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
        </span>
      </button>
      {expanded && (
        <div id="ai-credential-settings-content">
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-neutral-200">
            이 키는 현재 로그인한 내 계정에만 저장되며 워크스페이스 구성원과 공유되지 않습니다.
          </p>
          <div className="mt-2 space-y-2">
            {PROVIDERS.map(provider => (
              <CredentialCard
                key={provider.id}
                accessToken={accessToken}
                provider={provider.id}
                initialStatus={statuses[provider.id]}
                onStatusChange={updateStatus}
                {...provider}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
