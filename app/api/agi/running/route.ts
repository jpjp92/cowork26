import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agi/running
 * AGI-client.exe 프로세스가 현재 실행 중인지 확인.
 */
export async function GET() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq AGI-client.exe" /NH', { encoding: 'utf8', timeout: 3000 })
    const running = out.includes('AGI-client.exe')
    return NextResponse.json({ running })
  } catch {
    return NextResponse.json({ running: false })
  }
}
