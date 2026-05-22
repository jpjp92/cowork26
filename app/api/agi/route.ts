import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { kill } from 'process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { createHash } from 'crypto'

// 짭비스 AGI 서버 주소 (환경변수 없으면 기본 서버)
const SERVER_URL = process.env.JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

/**
 * 이 PC의 MAC 주소 기반 hud_token 계산.
 * EXE(Python)의 get_machine_id()와 동일 알고리즘:
 *   UUID5(DNS, "agi-{mac_int}")
 * Node.js에는 uuid5가 없으므로 SHA1(DNS_NAMESPACE + "agi-{mac_int}")로 직접 구현.
 * 같은 입력 → 항상 같은 출력 → MAC이 같으면 항상 같은 토큰.
 */
function getMachineHudToken(): string {
  try {
    // 물리 MAC 주소 찾기 (루프백/가상 NIC 제외)
    const ifaces = Object.values(os.networkInterfaces()).flat()
    const mac = ifaces.find(i => i && !i.internal && i.mac !== '00:00:00:00:00:00')?.mac ?? ''
    const macInt = mac ? parseInt(mac.replace(/:/g, ''), 16) : 0
    // UUID v5 수동 구현: SHA1(DNS_NAMESPACE_BYTES + name_bytes), 버전/변형 비트 세팅
    const DNS_NS = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex')
    const nameBuf = Buffer.from(`agi-${macInt}`, 'utf8')
    const hash = createHash('sha1').update(Buffer.concat([DNS_NS, nameBuf])).digest()
    hash[6] = (hash[6] & 0x0f) | 0x50  // version 5
    hash[8] = (hash[8] & 0x3f) | 0x80  // variant RFC4122
    const h = hash.toString('hex')
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`
  } catch {
    return ''
  }
}

// PID 파일 경로: Next.js 서버 재시작 후에도 직전 EXE 프로세스를 kill할 수 있도록 OS 임시폴더에 저장
const PID_FILE = path.join(os.tmpdir(), 'cowork26-agi.pid')

/** PID 파일 읽기 — 실패하면 null */
function readPidFile(): number | null {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim()
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** PID 파일 쓰기 — EXE 실행 후 PID 기록 */
function writePidFile(pid: number): void {
  try { fs.writeFileSync(PID_FILE, String(pid), 'utf8') } catch { /* 무시 */ }
}

/** PID 파일 삭제 — EXE 종료 후 정리 */
function clearPidFile(): void {
  try { fs.unlinkSync(PID_FILE) } catch { /* 없으면 무시 */ }
}

/** PID가 실제로 살아있는지 확인 (signal 0 = 존재 여부만 체크, kill 아님) */
function isProcessAlive(pid: number): boolean {
  try { kill(pid, 0); return true } catch { return false }
}

// 모듈 레벨 PID 캐시: API 요청마다 파일 읽기 생략 (핫패스용)
let agiPid: number | null = readPidFile()

/**
 * POST /api/agi
 * - 일반 호출: AGI-client.exe 백그라운드 실행 (이미 실행 중이면 재사용)
 * - body { _method: 'DELETE' }: sendBeacon으로 오는 종료 요청 (페이지 언로드 시)
 * - Windows 아닌 환경(Vercel/Linux): spawn 불가 → ok만 반환 (유저가 직접 EXE 실행)
 */
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

  // 이미 실행 중인 프로세스가 있으면 재사용 (새로고침 후 중복 실행 방지)
  const existingPid = agiPid ?? readPidFile()
  if (existingPid !== null && isProcessAlive(existingPid)) {
    agiPid = existingPid  // 메모리 캐시 동기화
    return NextResponse.json({ ok: true, pid: existingPid, reused: true, hud_token: getMachineHudToken() })
  }

  const exePath = path.join(process.cwd(), 'AGI-client.exe')

  // Vercel(Linux) 등 Windows가 아닌 환경에서는 spawn 불가 → ok 반환 (유저가 직접 EXE 실행)
  if (process.platform !== 'win32') {
    return NextResponse.json({ ok: true, mode: 'manual', hud_token: '' })
  }

  // EXE 존재 여부를 spawn 전에 확인 (spawn ENOENT는 비동기 이벤트라 try/catch 불가)
  if (!fs.existsSync(exePath)) {
    return NextResponse.json({ error: 'exe_not_found' }, { status: 404 })
  }

  const hudToken = getMachineHudToken()
  try {
    const exeArgs = ['--background']
    if (hudToken) exeArgs.push(`--hud-token=${hudToken}`)
    const child = spawn(exePath, exeArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,   // 콘솔 창 숨김 (작업표시줄 아이콘 방지)
    })
    child.unref()
    agiPid = child.pid ?? null
    if (agiPid !== null) writePidFile(agiPid)
    return NextResponse.json({ ok: true, pid: agiPid, hud_token: hudToken })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/agi
 * 페이지 언로드 시 fetch keepalive로 호출 → AGI-client.exe 프로세스 kill
 */
export async function DELETE() {
  const pid = agiPid ?? readPidFile()
  if (pid !== null) {
    try { kill(pid) } catch { /* 이미 종료됐거나 없는 PID */ }
    agiPid = null
    clearPidFile()
  }
  return NextResponse.json({ ok: true })
}

/**
 * GET /api/agi
 * AGI 서버에서 AGI-client.exe를 받아 process.cwd()/AGI-client.exe 에 직접 저장.
 * 브라우저 Downloads 폴더가 아닌 프로젝트 루트에 저장되므로 spawn 경로와 일치.
 * Vercel(Linux)에서는 쓰기 불가이므로 not_supported 반환.
 */
export async function GET() {
  if (process.platform !== 'win32') {
    return NextResponse.json({ error: 'not_supported' }, { status: 400 })
  }
  try {
    const upstream = await fetch(`${SERVER_URL}/download/AGI-client.exe`, {
      headers: { Accept: 'application/octet-stream' },
    })
    if (!upstream.ok) {
      return NextResponse.json({ error: 'EXE not found on AGI server' }, { status: 404 })
    }
    const buffer = Buffer.from(await upstream.arrayBuffer())
    const exePath = path.join(process.cwd(), 'AGI-client.exe')
    fs.writeFileSync(exePath, buffer)
    return NextResponse.json({ ok: true, path: exePath })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
