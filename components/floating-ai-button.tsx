'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

const AGI_PRIMARY_URL = process.env.NEXT_PUBLIC_JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

function getMessageTargetOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return 'http://49.142.52.133:1777'
  }
}

/** SVG 엘리먼트 → canvas → base64 PNG (Mermaid 다이어그램 캡처용) */
async function svgToBase64Png(svgEl: SVGElement): Promise<string | null> {
  try {
    const w = Math.max(svgEl.clientWidth, 400)
    const h = Math.max(svgEl.clientHeight, 300)
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    return await new Promise<string | null>((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(null); return }
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          URL.revokeObjectURL(blobUrl)
          // data:image/png;base64, 접두어 제거 → base64만 반환
          resolve(canvas.toDataURL('image/png').replace('data:image/png;base64,', ''))
        } catch { resolve(null) }
      }
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null) }
      img.src = blobUrl
    })
  } catch { return null }
}

/** 현재 페이지 컨텍스트 + 이미지(Mermaid/SVG 다이어그램) 수집 */
async function collectPageContext(): Promise<{ context: string; images: string[] }> {
  try {
    const url = window.location.href
    const title = document.title
    const selected = window.getSelection()?.toString().trim() ?? ''
    const mainEl = document.querySelector('main') ?? document.querySelector('article') ?? document.body
    const rawText = (mainEl as HTMLElement).innerText ?? ''
    const bodyText = rawText.replace(/\s{3,}/g, '\n').trim().slice(0, 1500)

    // ── Mermaid/SVG 다이어그램 → base64 PNG (최대 4개) ───────────
    const images: string[] = []
    const svgCandidates = Array.from(
      mainEl.querySelectorAll<SVGElement>(
        '.mermaid svg, [class*="mermaid"] svg, [class*="diagram"] svg, figure svg, .react-flow svg'
      )
    ).slice(0, 4)
    for (const svgEl of svgCandidates) {
      const b64 = await svgToBase64Png(svgEl)
      if (b64) images.push(b64)
    }

    // ── Mermaid 소스 코드 텍스트 (렌더링 전 코드블록) ─────────────
    const mermaidSrcs: string[] = []
    mainEl.querySelectorAll<HTMLElement>('pre.mermaid, code.language-mermaid, [data-mermaid]').forEach(el => {
      const src = (el.getAttribute('data-mermaid') || el.textContent || '').trim()
      if (src) mermaidSrcs.push(src.slice(0, 500))
    })

    // ── 본문 이미지 URL (아이콘 제외, 80px 이상) ─────────────────
    const imgUrls: string[] = []
    mainEl.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      if (img.naturalWidth > 80 && img.naturalHeight > 80 && img.src && !img.src.startsWith('data:')) {
        imgUrls.push(img.src)
      }
    })

    let ctx = `[현재 페이지 정보]\nURL: ${url}\n제목: ${title}`
    if (selected) ctx += `\n선택된 텍스트: ${selected}`
    if (bodyText) ctx += `\n\n페이지 내용:\n${bodyText}`
    if (mermaidSrcs.length > 0) ctx += `\n\n[다이어그램 소스]\n${mermaidSrcs.join('\n---\n')}`
    if (imgUrls.length > 0) ctx += `\n\n[이미지 URL]\n${imgUrls.slice(0, 8).join('\n')}`

    return { context: ctx, images }
  } catch {
    return { context: '', images: [] }
  }
}

export default function FloatingAiButton() {
  const [y, setY] = useState(300)
  const [panelOpen, setPanelOpen] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [agiBaseUrl] = useState(AGI_PRIMARY_URL)
  const [messageTargetOrigin] = useState(() => getMessageTargetOrigin(AGI_PRIMARY_URL))
  // ── exe 설치 관련 상태 ──────────────────────────────────────────────
  const [needsInstall, setNeedsInstall] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installDone, setInstallDone] = useState(false)
  const [installError, setInstallError] = useState(false)

  // 최초 1회 패널이 열리면 iframe을 DOM에 유지 (닫아도 unmount 안 함 → 재로딩 방지)
  const [iframeMounted, setIframeMounted] = useState(false)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startTop = useRef(0)
  const moved = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  /** iframe에 페이지 컨텍스트 + 이미지 전송 */
  const sendPageContext = useCallback(async () => {
    const { context, images } = await collectPageContext()
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'page_context', context, images },
      messageTargetOrigin,
    )
  }, [messageTargetOrigin])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      dragging.current = true
      moved.current = false
      startY.current = e.clientY
      startTop.current = y
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [y],
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return
    const dy = e.clientY - startY.current
    if (Math.abs(dy) > 4) moved.current = true
    const newY = Math.max(8, Math.min(window.innerHeight - 160, startTop.current + dy))
    setY(newY)
  }, [])

  const onPointerUp = useCallback(async () => {
    dragging.current = false
    if (!moved.current) {
      // 패널 열기/닫기 토글
      setPanelOpen(prev => {
        const next = !prev
        if (next) {
          setIframeMounted(true) // 최초 열릴 때 iframe 마운트 (이후 유지)
          // 패널이 열릴 때 최신 페이지 컨텍스트 전송 (약간 딜레이 — iframe 렌더 대기)
          setTimeout(sendPageContext, 300)
        }
        return next
      })
      // 이미 launched면 재실행 안 함 (자동 시작으로 이미 떠 있음)
      if (!launched) {
        setLaunching(true)
        fetch('/api/agi', { method: 'POST' })
          .then(res => { if (res.ok) setLaunched(true) })
          .catch(() => {})
          .finally(() => setLaunching(false))
      }
    }
  }, [launched])

  // ── AGI 클라이언트 EXE 다운로드 + 저장 ─────────────────────────
  // GET /api/agi → 서버가 AGI서버에서 받아 process.cwd()/AGI-client.exe에 직접 저장
  // 완료 후 POST /api/agi 재시도 → 바로 EXE 실행 (재시작 불필요)
  const startInstall = useCallback(async () => {
    setInstalling(true)
    setInstallProgress(0)
    setInstallError(false)
    try {
      // 진행 중 표시 (서버 다운로드라 스트리밍 진행률 없음 → 50%로 고정)
      setInstallProgress(30)
      const resp = await fetch('/api/agi')
      if (!resp.ok) throw new Error('server error')
      setInstallProgress(100)
      localStorage.setItem('agi_installed', '1')
      setInstallDone(true)
      // EXE가 저장됐으니 바로 실행 시도
      fetch('/api/agi', { method: 'POST' })
        .then(res => { if (res.ok) setLaunched(true) })
        .catch(() => {})
    } catch {
      setInstallError(true)
    } finally {
      setInstalling(false)
    }
  }, [])

  // ── 페이지 로드 시 즉시 AGI 백그라운드 자동 실행 ────────────────
  // Vercel(Linux)에서는 spawn 불가 → exe_not_found 항상 반환
  useEffect(() => {
    fetch('/api/agi', { method: 'POST' })
      .then(async (res) => {
        if (res.ok) { setLaunched(true); return }
        const body = await res.json().catch(() => ({}))
        if (body?.error === 'exe_not_found') {
          // EXE 없으면 localStorage 무시하고 무조건 설치 패널 표시
          localStorage.removeItem('agi_installed')
          setNeedsInstall(true)
        }
      })
      .catch(() => {})
  }, [])

  // 페이지 종료 시 exe kill
  useEffect(() => {
    const handleUnload = () => {
      navigator.sendBeacon('/api/agi', JSON.stringify({ _method: 'DELETE' }))
      fetch('/api/agi', { method: 'DELETE', keepalive: true }).catch(() => {})
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // URL 변경(라우팅) 시 컨텍스트 재전송
  useEffect(() => {
    if (!panelOpen) return
    sendPageContext()
  }, [panelOpen, sendPageContext])

  // 마우스 업 시 선택 텍스트 변경 감지 → 패널 열려있으면 컨텍스트 갱신
  useEffect(() => {
    const onSelect = () => { if (panelOpen) sendPageContext() }
    document.addEventListener('mouseup', onSelect)
    return () => document.removeEventListener('mouseup', onSelect)
  }, [panelOpen, sendPageContext])

  return (
    <>
      {/* ── 설치 패널 ── */}
      {needsInstall && (
        <div
          className="fixed right-[140px] z-50 flex flex-col overflow-hidden rounded-[12px] border-2 border-blue-400 bg-black shadow-[0_0_30px_6px_#3b82f660]"
          style={{ top: Math.max(8, y - 60), width: 420 }}
        >
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-blue-400/40 bg-black/90 px-3">
            <span className="text-[11px] font-black tracking-widest text-blue-300 drop-shadow-[0_0_5px_#3b82f6]">
              ◈ 짭비스 AI 설치
            </span>
            <button onClick={() => setNeedsInstall(false)} className="text-xs font-black text-blue-400 hover:text-white">✕</button>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {!installDone ? (
              <>
                <p className="text-[12px] text-blue-200">
                  {installing ? '짭비스 AI를 설치 중입니다...' : 'AGI 클라이언트가 필요합니다. 설치를 시작하세요.'}
                </p>
                {/* 진행률 바 */}
                {installing && (
                  <div className="h-3 w-full overflow-hidden rounded-full bg-blue-950 border border-blue-700">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all duration-200 shadow-[0_0_8px_#3b82f6]"
                      style={{ width: `${installProgress}%` }}
                    />
                  </div>
                )}
                {installing && (
                  <p className="text-center text-[11px] text-blue-400 font-mono">{installProgress}%</p>
                )}
                {installError && (
                  <p className="text-[11px] text-red-400">다운로드 실패. 서버 상태를 확인하세요.</p>
                )}
                <button
                  onClick={startInstall}
                  disabled={installing}
                  className="rounded-md border border-blue-400 bg-blue-950 px-4 py-2 text-[12px] font-black text-blue-300 hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {installing ? '설치 중...' : '▶ 설치 시작'}
                </button>
              </>
            ) : (
              <>
                <p className="text-[12px] text-green-400 font-black">✓ 설치 완료! 짭비스 AI를 시작합니다.</p>
                <button
                  onClick={() => setNeedsInstall(false)}
                  className="rounded-md border border-green-400 bg-green-950 px-4 py-2 text-[12px] font-black text-green-300 hover:bg-green-900 transition-colors"
                >
                  닫기
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ai HUD 패널 ── */}
      {/* 패널 컨테이너: panelOpen이 false면 display:none (iframe은 살아있어 재로딩 없음) */}
      <div
        className="fixed right-[140px] z-40 flex flex-col overflow-hidden rounded-[12px] border-2 border-blue-400 bg-black shadow-[0_0_30px_6px_#3b82f660]"
        style={{
          top: Math.max(8, y - 100),
          width: 1040,
          height: 800,
          display: panelOpen ? 'flex' : 'none',
        }}
      >
        {/* 패널 타이틀바 */}
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-blue-400/40 bg-black/90 px-3">
          <span className="text-[11px] font-black tracking-widest text-blue-300 drop-shadow-[0_0_5px_#3b82f6]">
            ◈ 짭비스 시스템
          </span>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-xs font-black text-blue-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        {/* HUD iframe — iframeMounted가 true일 때만 렌더링 (이후 display:none으로 숨겨도 살아있음) */}
        {iframeMounted && (
          <iframe
            ref={iframeRef}
            src={agiBaseUrl + '/hud/hud.html'}
            className="h-full w-full border-none bg-black"
            allow="microphone; camera"
            title="짭비스 HUD"
            onLoad={sendPageContext}
          />
        )}
      </div>

      {/* ── 플로팅 버튼 ── */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ top: y }}
        className={[
          'fixed right-3 z-50',
          'flex h-[120px] w-[120px] cursor-grab touch-none select-none flex-col items-center justify-center gap-1',
          'rounded-full border-2 border-white bg-black/80 backdrop-blur-sm',
          panelOpen
            ? 'shadow-[0_0_24px_8px_#3b82f6,0_0_48px_16px_#3b82f660,inset_0_0_16px_#1e40af]'
            : 'shadow-[0_0_10px_2px_#3b82f6,0_0_22px_6px_#3b82f640,inset_0_0_8px_#1e3a8a]',
          'transition-shadow duration-200',
          'hover:shadow-[0_0_16px_5px_#60a5fa,0_0_36px_10px_#3b82f660,inset_0_0_12px_#1e40af]',
          'active:cursor-grabbing active:scale-95',
          launching ? 'animate-pulse' : '',
        ].join(' ')}
        title="짭비스 실행"
      >
        <div className="relative h-20 w-20 overflow-hidden rounded-full border border-blue-400/60 shadow-[0_0_6px_#3b82f6]">
          <Image
            src="/ai-image.png"
            alt="짭비스"
            fill
            className="object-cover"
            draggable={false}
          />
        </div>
      </button>
    </>
  )
}
