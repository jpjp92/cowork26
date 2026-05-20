import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { kill } from 'process'
import path from 'path'
import fs from 'fs'
import os from 'os'

// PID 파일: 서버 재시작 후에도 이전 프로세스를 kill할 수 있도록 파일에 저장
const PID_FILE = path.join(os.tmpdir(), 'cowork26-agi.pid')

function readPidFile(): number | null {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim()
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writePidFile(pid: number): void {
  try { fs.writeFileSync(PID_FILE, String(pid), 'utf8') } catch { /* 무시 */ }
}

function clearPidFile(): void {
  try { fs.unlinkSync(PID_FILE) } catch { /* 없으면 무시 */ }
}

// 서버 메모리에도 캐시 (핫패스용)
let agiPid: number | null = readPidFile()

export async function POST(request: Request) {
  // sendBeacon은 DELETE 메서드를 지원 안 해서 body로 구분
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    if (body?._method === 'DELETE') {
      const pid = agiPid ?? readPidFile()
      if (pid !== null) {
        try { kill(pid) } catch { /* 이미 종료 */ }
        agiPid = null
        clearPidFile()
      }
      return NextResponse.json({ ok: true })
    }
  } catch { /* body 없음 — 일반 실행 요청 */ }

  const exePath = path.join(process.cwd(), 'AGI-client.exe')
  try {
    const child = spawn(exePath, ['--background'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    agiPid = child.pid ?? null
    if (agiPid !== null) writePidFile(agiPid)
    return NextResponse.json({ ok: true, pid: agiPid })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  const pid = agiPid ?? readPidFile()
  if (pid !== null) {
    try { kill(pid) } catch { /* 이미 종료됐거나 없는 PID */ }
    agiPid = null
    clearPidFile()
  }
  return NextResponse.json({ ok: true })
}
