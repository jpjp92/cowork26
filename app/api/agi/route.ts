import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { kill } from 'process'
import path from 'path'

// 서버 메모리에 PID 보관 (로컬 단일 프로세스 실행 기준)
let agiPid: number | null = null

export async function POST(request: Request) {
  // sendBeacon은 DELETE 메서드를 지원 안 해서 body로 구분
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    if (body?._method === 'DELETE') {
      if (agiPid !== null) {
        try { kill(agiPid) } catch { /* 이미 종료 */ }
        agiPid = null
      }
      return NextResponse.json({ ok: true })
    }
  } catch { /* body 없음 — 일반 실행 요청 */ }

  const exePath = path.join(process.cwd(), 'AGI-client.exe')
  try {
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    agiPid = child.pid ?? null
    return NextResponse.json({ ok: true, pid: agiPid })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  if (agiPid !== null) {
    try { kill(agiPid) } catch { /* 이미 종료됐거나 없는 PID */ }
    agiPid = null
  }
  return NextResponse.json({ ok: true })
}
