'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const SERVER_URL = process.env.NEXT_PUBLIC_JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

interface UploadedFile {
  name: string
  size: number
  url: string
}

export default function FileSharePanel() {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    try {
      const r = await fetch('/api/uploads')
      const d = await r.json()
      if (d.files) setFiles(d.files)
    } catch {}
  }, [])

  useEffect(() => {
    if (open) loadFiles()
  }, [open, loadFiles])

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    const items = Array.from(fileList)
    if (!items.length) return
    setUploading(true)
    const fd = new FormData()
    items.forEach(f => fd.append('files', f))
    try {
      const r = await fetch('/api/uploads', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.ok) await loadFiles()
    } catch {}
    setUploading(false)
  }, [loadFiles])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
  }

  const fmtSize = (n: number) =>
    n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB'

  return (
    <>
      {/* 토글 버튼 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="파일 공유"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9900,
          width: 48, height: 48, borderRadius: '50%',
          background: open ? '#1d6fa6' : '#0f3855',
          border: '2px solid #1d9ed4', color: '#7fdfff',
          fontSize: 20, cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        📁
      </button>

      {/* 패널 */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 24, zIndex: 9901,
          width: 340, maxHeight: '60vh',
          background: '#0a1828', border: '1px solid #1d9ed4',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'monospace', fontSize: 13, color: '#7fdfff',
        }}>
          {/* 헤더 */}
          <div style={{
            padding: '8px 14px', borderBottom: '1px solid rgba(29,158,212,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(29,158,212,0.08)',
          }}>
            <span style={{ fontWeight: 600, letterSpacing: 1 }}>📁 파일 공유</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadFiles} title="새로고침"
                style={{ background: 'none', border: 'none', color: '#7fdfff', cursor: 'pointer', fontSize: 14 }}>⟳</button>
              <button onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#7fdfff', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* 드래그 업로드 영역 */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              margin: 10, padding: '14px 10px', textAlign: 'center',
              border: `2px dashed ${dragOver ? '#1d9ed4' : 'rgba(29,158,212,0.3)'}`,
              background: dragOver ? 'rgba(29,158,212,0.08)' : 'transparent',
              cursor: 'pointer', transition: 'all 0.15s',
              color: 'rgba(127,223,255,0.6)',
            }}
          >
            {uploading ? '⏳ 업로드 중...' : '📎 클릭 또는 파일을 여기 드래그\n(여러 파일 가능)'}
            <input ref={inputRef} type="file" multiple onChange={onInputChange} style={{ display: 'none' }} />
          </div>

          {/* 파일 목록 */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 10px 10px' }}>
            {files.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(127,223,255,0.35)', padding: 16 }}>업로드된 파일 없음</div>
            ) : (
              files.map(f => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 6px', borderBottom: '1px solid rgba(29,158,212,0.1)',
                  gap: 8,
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={f.name}>{f.name}</span>
                  <span style={{ color: 'rgba(127,223,255,0.45)', flexShrink: 0, fontSize: 11 }}>{fmtSize(f.size)}</span>
                  <a
                    href={`${SERVER_URL}${f.url}`}
                    download={f.name}
                    style={{ color: '#1d9ed4', textDecoration: 'none', flexShrink: 0, fontSize: 11 }}
                  >⬇</a>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
