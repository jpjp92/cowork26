'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { notionLiteApi } from '../../lib/notion-lite/api'
import type { AiCredentialProvider, WorkspaceAiPolicy } from '../../lib/notion-lite/types'

const PROVIDERS: Array<{ id: AiCredentialProvider; label: string; color: string }> = [
  { id: 'openai', label: 'OpenAI', color: 'bg-[#baf7c8]' },
  { id: 'gemini', label: 'Gemini', color: 'bg-[#c4b5fd]' },
]

function sameValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every(value => right.includes(value))
}

export function WorkspaceAiPolicySettings({
  accessToken,
  workspaceId,
  canManage,
}: {
  accessToken: string
  workspaceId: string
  canManage: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [policy, setPolicy] = useState<WorkspaceAiPolicy | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [allowedProviders, setAllowedProviders] = useState<AiCredentialProvider[]>(['openai', 'gemini'])
  const [allowEditors, setAllowEditors] = useState(true)
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const saveControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    saveControllerRef.current?.abort()
    setExpanded(false)
    setPolicy(null)
    setConsent(false)
    setError('')
    setLoading(true)
    notionLiteApi.getWorkspaceAiPolicy(accessToken, workspaceId, controller.signal)
      .then(next => {
        setPolicy(next)
        setEnabled(next.enabled)
        setAllowedProviders(next.allowedProviders)
        setAllowEditors(next.allowedRoles.includes('editor'))
      })
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : '워크스페이스 AI 정책을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
      saveControllerRef.current?.abort()
    }
  }, [accessToken, workspaceId])

  const allowedRoles = useMemo<Array<'owner' | 'editor'>>(
    () => allowEditors ? ['owner', 'editor'] : ['owner'],
    [allowEditors],
  )
  const dirty = Boolean(policy) && (
    enabled !== policy?.enabled
    || !sameValues(allowedProviders, policy?.allowedProviders ?? [])
    || !sameValues(allowedRoles, policy?.allowedRoles ?? [])
  )
  const needsConsent = enabled && !policy?.enabled

  const toggleProvider = (provider: AiCredentialProvider) => {
    setAllowedProviders(previous => {
      if (previous.includes(provider)) {
        return previous.length === 1 ? previous : previous.filter(value => value !== provider)
      }
      return [...previous, provider]
    })
  }

  const save = async () => {
    if (!canManage || !dirty || saving || (needsConsent && !consent)) return
    const controller = new AbortController()
    saveControllerRef.current?.abort()
    saveControllerRef.current = controller
    setSaving(true)
    setError('')
    try {
      const next = await notionLiteApi.updateWorkspaceAiPolicy(accessToken, workspaceId, {
        enabled,
        allowedProviders,
        allowedRoles,
      }, controller.signal)
      setPolicy(next)
      setEnabled(next.enabled)
      setAllowedProviders(next.allowedProviders)
      setAllowEditors(next.allowedRoles.includes('editor'))
      setConsent(false)
    } catch (saveError) {
      if (!controller.signal.aborted) {
        setError(saveError instanceof Error ? saveError.message : '워크스페이스 AI 정책을 저장하지 못했습니다.')
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false)
      if (saveControllerRef.current === controller) saveControllerRef.current = null
    }
  }

  const statusLabel = loading ? '확인 중' : error && !policy ? '확인 실패' : policy?.enabled ? '사용 중' : '사용 안 함'

  return (
    <section aria-labelledby="workspace-ai-policy-heading" className="mt-3 border-t border-black pt-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="workspace-ai-policy-content"
        onClick={() => setExpanded(value => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span>
          <span id="workspace-ai-policy-heading" className="block text-[11px] font-black uppercase text-neutral-100">워크스페이스 AI 사용</span>
          <span className="mt-0.5 block text-[11px] font-medium text-neutral-300">문서 외부 전송 정책</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`rounded border border-black px-1.5 py-0.5 text-[10px] font-black text-black ${policy?.enabled ? 'bg-[#baf7c8]' : 'bg-neutral-300'}`}>
            {statusLabel}
          </span>
          <span aria-hidden="true" className={`text-sm font-black transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
        </span>
      </button>

      {expanded && (
        <div id="workspace-ai-policy-content" className="mt-2 rounded-[8px] border border-black bg-[#62625f] p-3">
          {loading ? (
            <p role="status" className="text-xs font-bold text-neutral-200">AI 정책 확인 중...</p>
          ) : policy ? (
            <>
              <div className="rounded-[6px] border border-black bg-[#fde68a] p-2.5 text-[11px] font-bold leading-relaxed text-black">
                활성화하면 사용자가 선택한 문서 내용이 선택한 AI 제공자의 서버로 전송됩니다. 워크스페이스 전체나 하위 페이지가 자동 전송되지는 않습니다.
              </div>

              {canManage ? (
                <>
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[8px] border border-black bg-[#50504d] px-3">
                    <span className="text-xs font-black">문서 AI 분석 허용</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={event => {
                        setEnabled(event.target.checked)
                        if (!event.target.checked) setConsent(false)
                      }}
                      className="h-5 w-5 accent-[#baf7c8]"
                    />
                  </label>

                  <fieldset className="mt-3" disabled={!enabled || saving}>
                    <legend className="text-[11px] font-black uppercase text-neutral-100">허용할 AI 제공자</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {PROVIDERS.map(provider => (
                        <label key={provider.id} className={`flex min-h-11 items-center gap-2 rounded-[8px] border border-black px-2 text-xs font-black text-black ${provider.color} ${
                          allowedProviders.length === 1 && allowedProviders.includes(provider.id) ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                        }`}>
                          <input
                            type="checkbox"
                            checked={allowedProviders.includes(provider.id)}
                            disabled={allowedProviders.length === 1 && allowedProviders.includes(provider.id)}
                            onChange={() => toggleProvider(provider.id)}
                            className="h-4 w-4 accent-black"
                          />
                          {provider.label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] font-medium text-neutral-300">최소 한 개의 제공자를 선택해야 합니다.</p>
                  </fieldset>

                  <fieldset className="mt-3" disabled={!enabled || saving}>
                    <legend className="text-[11px] font-black uppercase text-neutral-100">분석 가능 역할</legend>
                    <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-[8px] border border-black">
                      <button
                        type="button"
                        aria-pressed={!allowEditors}
                        onClick={() => setAllowEditors(false)}
                        className={`min-h-11 px-2 text-xs font-black ${!allowEditors ? 'bg-[#fde68a] text-black' : 'bg-[#50504d] text-neutral-200'}`}
                      >Owner만</button>
                      <button
                        type="button"
                        aria-pressed={allowEditors}
                        onClick={() => setAllowEditors(true)}
                        className={`min-h-11 border-l border-black px-2 text-xs font-black ${allowEditors ? 'bg-[#fde68a] text-black' : 'bg-[#50504d] text-neutral-200'}`}
                      >Owner + Editor</button>
                    </div>
                  </fieldset>

                  {needsConsent && (
                    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-[8px] border border-black bg-[#50504d] p-2.5">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={event => setConsent(event.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#baf7c8]"
                      />
                      <span className="text-[11px] font-bold leading-relaxed text-white">
                        선택한 문서 내용이 외부 AI 제공자에게 전송될 수 있음을 확인했습니다.
                      </span>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || saving || (needsConsent && !consent)}
                    className="mt-3 min-h-11 w-full rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 md:min-h-9"
                  >{saving ? '저장 중...' : 'AI 정책 저장'}</button>
                </>
              ) : (
                <div className="mt-3 space-y-2 text-xs font-bold text-neutral-100">
                  <p>허용 제공자: {policy.allowedProviders.map(value => value === 'openai' ? 'OpenAI' : 'Gemini').join(', ')}</p>
                  <p>허용 역할: {policy.allowedRoles.includes('editor') ? 'Owner, Editor' : 'Owner'}</p>
                  <p className="text-[11px] text-neutral-300">정책 변경은 워크스페이스 owner만 할 수 있습니다.</p>
                </div>
              )}
            </>
          ) : null}
          {error && <p role="alert" className="mt-2 text-xs font-bold leading-relaxed text-red-200">{error}</p>}
        </div>
      )}
    </section>
  )
}
