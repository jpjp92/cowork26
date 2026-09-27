import { describe, expect, it } from 'vitest'
import { readBoundedJson } from '../../app/api/_utils/request-body'

function chunkedRequest(chunks: string[], headers?: HeadersInit) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })

  return new Request('http://localhost/test', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

describe('readBoundedJson', () => {
  it('parses a body without Content-Length', async () => {
    const request = chunkedRequest(['{"ok":', 'true}'])
    await expect(readBoundedJson(request, 64)).resolves.toEqual({ ok: true })
  })

  it('rejects a dishonest small Content-Length when streamed bytes exceed the limit', async () => {
    const request = chunkedRequest(['{"value":"', '1234567890', '"}'], { 'content-length': '2' })
    await expect(readBoundedJson(request, 12)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
    })
  })

  it('rejects a declared oversized body before reading it', async () => {
    const request = chunkedRequest(['{}'], { 'content-length': '1024' })
    await expect(readBoundedJson(request, 10)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' })
  })

  it('rejects invalid Content-Length and invalid JSON', async () => {
    await expect(readBoundedJson(chunkedRequest(['{}'], { 'content-length': 'NaN' }), 10))
      .rejects.toMatchObject({ code: 'INVALID_JSON' })
    await expect(readBoundedJson(chunkedRequest(['{"broken"']), 64))
      .rejects.toMatchObject({ code: 'INVALID_JSON' })
  })
})
