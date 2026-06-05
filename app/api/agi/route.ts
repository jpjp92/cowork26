import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const SERVER_URL = process.env.JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

// 환경변수를 활용하여 드라이브(C:, D: 등) 무관하게 경로 추적
const getPossiblePaths = () => {
  const paths = [path.join(process.cwd(), 'AGI-client.exe')] // 현재 프로젝트 내 (상대경로)
  
  if (process.platform === 'win32') {
    if (process.env.PROGRAMFILES) paths.push(path.join(process.env.PROGRAMFILES, 'JjapVis AGI', 'AGI-client.exe'))
    if (process.env['PROGRAMFILES(X86)']) paths.push(path.join(process.env['PROGRAMFILES(X86)'], 'JjapVis AGI', 'AGI-client.exe'))
    if (process.env.LOCALAPPDATA) paths.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'JjapVis AGI', 'AGI-client.exe'))
  }
  return paths
}

function isProcessRunning(processName: string): boolean {
  if (process.platform !== 'win32') return false // 리눅스(Vercel)에서는 실행 안 함
  try {
    const output = execSync('tasklist', { encoding: 'utf-8' })
    return output.toLowerCase().includes(processName.toLowerCase())
  } catch (e) {
    return false
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token = body.hud_token || crypto.randomUUID()
  
  const exeName = 'AGI-client.exe'
  
  const agiUrl = `agi://start?hud_token=${token}`

  // 1. 이미 실행 중인지 프로세스 확인 (중복 실행 방지)
  if (isProcessRunning(exeName)) {
    return NextResponse.json({ 
      ok: true, 
      status: 'already_running',
      hud_token: token,
      agi_url: agiUrl
    })
  }

  // 2. 환경변수를 활용하여 여러 상대/절대 경로에서 exe 파일 찾기
  let foundExePath = null
  for (const p of getPossiblePaths()) {
    if (fs.existsSync(p)) {
      foundExePath = p
      break
    }
  }

  // 3. exe 파일이 존재하지만 실행 중이 아니면 프론트에서 프로토콜로 실행하도록 유도
  if (foundExePath) {
    return NextResponse.json({ 
      ok: true, 
      status: 'needs_launch',
      hud_token: token,
      path: foundExePath,
      agi_url: agiUrl
    })
  }

  // 4. 찾지 못했다면 실패 반환 (프론트에서 다운로드 유도 및 프로토콜 실행 대안 제공)
  return NextResponse.json({ 
    ok: false, 
    error: 'exe_not_found',
    download_url: `${SERVER_URL}/download/AGI-client.msi`,
    agi_url: agiUrl
  })
}

export async function DELETE() {
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    download_url: `${SERVER_URL}/download/AGI-client.msi`,
  })
}

