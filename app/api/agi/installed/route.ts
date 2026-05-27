import { NextResponse } from 'next/server'
import fs from 'fs'

export const dynamic = 'force-dynamic'

const EXE_PATH = 'C:\\Program Files (x86)\\JjapVis AGI\\AGI-client.exe'

/**
 * GET /api/agi/installed
 * 로컬 PC에 AGI-client.exe 있는지 파일 경로 직접 확인 (타임아웃 없음).
 * Vercel 배포 환경에서는 파일 없으므로 false 반환.
 */
export async function GET() {
  const installed = fs.existsSync(EXE_PATH)
  return NextResponse.json({ installed })
}
