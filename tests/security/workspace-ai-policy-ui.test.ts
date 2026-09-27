import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/notion-lite/workspace-ai-policy.tsx', 'utf8')

describe('workspace AI policy opt-in UI', () => {
  it('requires explicit external-transfer acknowledgement before first enable', () => {
    expect(source).toContain('선택한 문서 내용이 외부 AI 제공자에게 전송될 수 있음을 확인했습니다.')
    expect(source).toContain('needsConsent && !consent')
  })

  it('does not invoke a provider or accept browser-controlled model settings', () => {
    expect(source).not.toMatch(/connectAiCredential|analyze\(|modelId|apiKey/)
  })

  it('keeps owner access and limits UI choices to OpenAI and Gemini', () => {
    expect(source).toContain("['owner', 'editor']")
    expect(source).toContain("['owner']")
    expect(source).toContain("id: 'openai'")
    expect(source).toContain("id: 'gemini'")
    expect(source).not.toContain("id: 'fake'")
  })
})
