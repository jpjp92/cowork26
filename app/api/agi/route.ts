import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import os from 'os'

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
    const ifaces = Object.values(os.networkInterfaces()).flat()
    const mac = ifaces.find(i => i && !i.internal && i.mac !== '00:00:00:00:00:00')?.mac ?? ''
    const macInt = mac ? parseInt(mac.replace(/:/g, ''), 16) : 0
    const DNS_NS = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex')
    const nameBuf = Buffer.from(`agi-${macInt}`, 'utf8')
    const hash = createHash('sha1').update(Buffer.concat([DNS_NS, nameBuf])).digest()
    hash[6] = (hash[6] & 0x0f) | 0x50
    hash[8] = (hash[8] & 0x3f) | 0x80
    const h = hash.toString('hex')
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`
  } catch {
    return ''
  }
}

/**
 * POST /api/agi
 * MSI 설치 후 agi:// 프로토콜로 AGI-client 실행.
 * - body { _method: 'DELETE' }: sendBeacon 종료 요청 (no-op — MSI 프로세스는 OS가 관리)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    if (body?._method === 'DELETE') {
      return NextResponse.json({ ok: true })
    }
  } catch { /* body 없음 */ }

  return NextResponse.json({ ok: true, mode: 'protocol', agi_url: 'agi://start' })
}

/**
 * DELETE /api/agi — no-op (MSI 프로세스는 OS/부팅 자동시작으로 관리, 웹에서 kill 안 함)
 */
export async function DELETE() {
  return NextResponse.json({ ok: true })
}

/**
 * GET /api/agi
 * AGI 서버의 MSI 다운로드 URL 반환 → 브라우저가 직접 AGI 서버에서 MSI 다운로드.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    download_url: `${SERVER_URL}/download/AGI-client.msi`,
  })
}
