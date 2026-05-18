import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST() {
  const exePath = path.join(process.cwd(), 'AGI-client.exe')

  try {
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
