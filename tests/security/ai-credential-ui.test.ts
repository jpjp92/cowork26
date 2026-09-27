import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/notion-lite/ai-credential-settings.tsx', 'utf8')

describe('AI credential settings secret handling', () => {
  it('uses password inputs without stored-key reveal or copy controls', () => {
    expect(source).toContain('type="password"')
    expect(source).toContain('autoComplete="new-password"')
    expect(source).not.toMatch(/showApiKey|copyApiKey|navigator\.clipboard/)
  })

  it('clears React key state before starting the credential request', () => {
    const clearIndex = source.indexOf("setApiKey('')", source.indexOf('const connect = async'))
    const requestIndex = source.indexOf('notionLiteApi.connectAiCredential', source.indexOf('const connect = async'))
    expect(clearIndex).toBeGreaterThan(-1)
    expect(requestIndex).toBeGreaterThan(clearIndex)
  })

  it('aborts credential requests when the settings UI unmounts', () => {
    expect(source).toContain('mutationControllerRef.current?.abort()')
    expect(source).toContain('controller.abort()')
  })
})
