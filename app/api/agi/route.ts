import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import os from 'os'

const SERVER_URL = process.env.JJAPVIS_SERVER_URL ?? 'http://49.142.52.133:1777'

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

export async function POST() {
  const token = getMachineHudToken()
  return NextResponse.json({ ok: true, mode: 'protocol', agi_url: `agi://start?hud_token=${token}`, hud_token: token })
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
