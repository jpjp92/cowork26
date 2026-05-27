'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

const AGI_PRIMARY_URL = process.env.NEXT_PUBLIC_JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'
const AGI_FALLBACK_URL = 'http://49.142.52.133:1777'

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
  // ── exe 설치 관련 상태 ──────────────────────────────────────────────
  const [needsInstall, setNeedsInstall] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installDone, setInstallDone] = useState(false)
  const [installError, setInstallError] = useState(false)

  // 최초 1회 패널이 열리면 iframe을 DOM에 유지 (닫아도 unmount 안 함 → 재로딩 방지)
  const [iframeMounted, setIframeMounted] = useState(false)
  // EXE와 HUD를 페어링하는 MAC 기반 토큰 (POST /api/agi 응답에서 수신)
  const [hudToken, setHudToken] = useState('')
  const dragging = useRef(false)
  const startY = useRef(0)
  const startTop = useRef(0)
  const moved = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const agiStartedRef = useRef(false)
  // 패널 크기 (vw/vh 기반 초기값, SSR 안전)
  const [panelW, setPanelW] = useState(1040)
  const [panelH, setPanelH] = useState(700)
  const [panelTopOffset, setPanelTopOffset] = useState(0)
  const resizing = useRef(false)
  const resizeDir = useRef<'bl' | 'tl'>('bl')
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, topOffset: 0 })

  // 클라이언트에서만 화면 크기 기반 설정
  useEffect(() => {
    setPanelW(Math.round(window.innerWidth  * 0.85))
    setPanelH(Math.round(window.innerHeight * 0.80))
  }, [])

  const sendPageContext = useCallback(async () => {
    const { context, images } = await collectPageContext()
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'page_context', context, images },
      '*',
    )
  }, [])

  // 패널 리사이즈 핸들러 (좌하단 'bl' / 좌상단 'tl')
  const onResizeDown = useCallback((dir: 'bl' | 'tl') => (e: React.PointerEvent<HTMLDivElement>) => {
    resizing.current = true
    resizeDir.current = dir
    resizeStart.current = { x: e.clientX, y: e.clientY, w: panelW, h: panelH, topOffset: panelTopOffset }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }, [panelW, panelH, panelTopOffset])

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing.current) return
    const dx = e.clientX - resizeStart.current.x
    const dy = e.clientY - resizeStart.current.y
    // 왼쪽 핸들: 왼쪽으로 드래그 시 폭 증가 (dx 반전)
    setPanelW(Math.max(400, resizeStart.current.w - dx))
    if (resizeDir.current === 'bl') {
      // 좌하단: 아래로 드래그 시 높이 증가
      setPanelH(Math.max(300, resizeStart.current.h + dy))
    } else {
      // 좌상단: 위로 드래그 시 높이 증가, top도 같이 올라감 (하단 고정)
      const newH = Math.max(300, resizeStart.current.h - dy)
      const actualDH = newH - resizeStart.current.h
      setPanelH(newH)
      setPanelTopOffset(resizeStart.current.topOffset - actualDH)
    }
  }, [])

  const onResizeUp = useCallback(() => { resizing.current = false }, [])

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
          .then(async r => {
            if (r.ok) {
              setLaunched(true)
              const data = await r.json().catch(() => ({}))
              if (data?.hud_token) setHudToken(data.hud_token)
              if (data?.mode === 'protocol' && data?.agi_url) {
                window.location.assign(data.agi_url)
                pollClientConnected(data.hud_token ?? '')
              }
            }
          })
          .catch(() => {})
          .finally(() => setLaunching(false))
      }
    }
  }, [launched])

  // ── AGI 클라이언트 MSI 다운로드 + 저장 ─────────────────────────
  // GET /api/agi: 로컬 Windows → 서버가 AGI서버에서 받아 process.cwd()에 저장
  //              Vercel    → { download_url } 반환 → 브라우저가 MSI 직접 다운로드
  const startInstall = useCallback(async () => {
    setInstalling(true)
    setInstallProgress(0)
    setInstallError(false)
    try {
      setInstallProgress(30)
      const resp = await fetch('/api/agi')
      if (!resp.ok) throw new Error('server error')
      const data = await resp.json().catch(() => ({}))

      if (data?.download_url) {
        // Vercel 모드: 브라우저로 MSI 직접 다운로드 (Downloads 폴더에 저장됨)
        window.open(data.download_url, '_blank')
        setInstallProgress(100)
        localStorage.setItem('agi_installed', '1')
        setInstallDone(true)
        return
      }

      // 로컬 Windows 모드: 서버가 EXE/MSI를 process.cwd()에 저장 → 바로 실행
      setInstallProgress(100)
      localStorage.setItem('agi_installed', '1')
      setInstallDone(true)
      fetch('/api/agi', { method: 'POST' })
        .then(async res => {
          if (res.ok) {
            setLaunched(true)
            const d = await res.json().catch(() => ({}))
            if (d?.hud_token) setHudToken(d.hud_token)
            if (d?.mode === 'protocol' && d?.agi_url) {
              window.location.assign(d.agi_url)
            }
          }
        })
        .catch(() => {})
    } catch {
      setInstallError(true)
    } finally {
      setInstalling(false)
    }
  }, [])

  // ── AGI 클라이언트 연결 상태 polling ───────────────────────────────
  // agi:// 열기 후 WS 연결 될 때까지 1초 간격으로 polling (설치 패널은 절대 띄우지 않음)
  const pollClientConnected = useCallback((token: string) => {
    let attempts = 0
    const MAX = 30
    const timer = setInterval(async () => {
      attempts++
      try {
        const qs = token ? '?hud_token=' + encodeURIComponent(token) : ''
        const r = await fetch(`/api/agi/connected${qs}`, { cache: 'no-store' })
        if (r.ok) {
          const d = await r.json().catch(() => ({}))
          if (d?.connected) {
            clearInterval(timer)
            setNeedsInstall(false)
            return
          }
        }
      } catch { /* 일시 불가 → 계속 시도 */ }
      if (attempts >= MAX) clearInterval(timer)  // 30초 후 그냥 중단, 설치 패널 없음
    }, 1000)
  }, [])

  // ── 페이지 로드 시 AGI 실행 ────────────────────────────────────────
  useEffect(() => {
    if (agiStartedRef.current) return
    agiStartedRef.current = true
    ;(async () => {
      // 1) EXE 파일 존재 여부 즉시 확인 → 없으면 설치 패널, 끝
      try {
        const ri = await fetch('/api/agi/installed', { cache: 'no-store' })
        if (ri.ok && !(await ri.json().catch(() => ({}))).installed) {
          setNeedsInstall(true)
          return
        }
      } catch { /* 무시 */ }

      // 2) 프로세스 실행 중인지 확인 → 실행 중이면 agi:// 재실행 안 함
      try {
        const rr = await fetch('/api/agi/running', { cache: 'no-store' })
        if (rr.ok && (await rr.json().catch(() => ({}))).running) {
          setLaunched(true)
          pollClientConnected('')
          return
        }
      } catch { /* 무시 */ }

      // 3) 프로세스 없음 → agi:// 실행
      fetch('/api/agi', { method: 'POST' })
        .then(async (res) => {
          if (res.ok) {
            setLaunched(true)
            const data = await res.json().catch(() => ({}))
            if (data?.hud_token) setHudToken(data.hud_token)
            if (data?.mode === 'protocol' && data?.agi_url) {
              window.location.assign(data.agi_url)
              pollClientConnected(data.hud_token ?? '')
            }
          }
        })
        .catch(() => {})
    })()
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
                  {installing
                    ? 'MSI 다운로드 중...'
                    : 'AGI 클라이언트(MSI)가 필요합니다. 다운로드 후 설치하세요.'}
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
                  {installing ? 'MSI 다운로드 중...' : '▶ MSI 다운로드 & 설치'}
                </button>
              </>
            ) : (
              <>
                <p className="text-[12px] text-green-400 font-black">✓ MSI 다운로드 완료! 파일을 실행해 설치하세요.</p>
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
          top: Math.max(8, y - 100 + panelTopOffset),
          width: panelW,
          height: panelH,
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
            src={agiBaseUrl + '/hud/hud.html' + (hudToken ? '?hud_token=' + encodeURIComponent(hudToken) : '')}
            className="h-full w-full border-none bg-black"
            allow="microphone; camera"
            title="짭비스 HUD"
            onLoad={sendPageContext}
          />
        )}
        {/* 리사이즈 핸들 — 좌상단 */}
        <div
          onPointerDown={onResizeDown('tl')}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          style={{
            position: 'absolute', left: 0, top: 0,
            width: 18, height: 18, cursor: 'nwse-resize',
            background: 'linear-gradient(315deg, transparent 40%, #3b82f6 40%)',
            borderRadius: '10px 0 0 0',
          }}
        />
        {/* 리사이즈 핸들 — 좌하단 */}
        <div
          onPointerDown={onResizeDown('bl')}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          style={{
            position: 'absolute', left: 0, bottom: 0,
            width: 18, height: 18, cursor: 'nesw-resize',
            background: 'linear-gradient(225deg, transparent 40%, #3b82f6 40%)',
            borderRadius: '0 0 0 10px',
          }}
        />
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
