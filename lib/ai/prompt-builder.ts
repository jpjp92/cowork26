import 'server-only'

import { createHash } from 'node:crypto'
import { isAnalysisMode, type AnalysisMode } from './output-schema'
import { COMMON_PROMPT_VERSION, COMMON_SYSTEM_RULES } from './prompts/common-rules'
import { SUMMARY_PROMPT } from './prompts/summary'
import { ORGANIZE_PROMPT } from './prompts/organize'
import { ANALYSIS_PROMPT } from './prompts/analysis'
import { QUESTION_PROMPT } from './prompts/question'
import { ACTION_ITEMS_PROMPT } from './prompts/action-items'

const MAX_SOURCES = 10
const MAX_SOURCE_BYTES = 256 * 1024
const MAX_ADDITIONAL_REQUEST_CHARS = 1_000
const MAX_ADDITIONAL_REQUEST_BYTES = 4_000
const SOURCE_LABEL_RE = /^S(?:[1-9]|10)$/

const TEMPLATES = {
  summary: SUMMARY_PROMPT,
  organize: ORGANIZE_PROMPT,
  analysis: ANALYSIS_PROMPT,
  question: QUESTION_PROMPT,
  action_items: ACTION_ITEMS_PROMPT,
} as const

export type PromptSource = {
  label: string
  revision: number
  title: string
  content: string
}

export type BuiltAnalysisPrompt = {
  systemPrompt: string
  userPrompt: string
  sourceLabels: string[]
  metadata: { templateVersion: string; promptHash: string }
}

export class PromptInputError extends Error {
  readonly code = 'INVALID_PROMPT_INPUT'
  constructor(message: string) {
    super(message)
    this.name = 'PromptInputError'
  }
}

function normalize(value: string) {
  return value.replace(/\0/g, '').replace(/\r\n?/g, '\n').trim()
}

function escapeEnvelope(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildAnalysisPrompt(input: {
  mode: AnalysisMode
  sources: readonly PromptSource[]
  additionalRequest?: string
}): BuiltAnalysisPrompt {
  if (!isAnalysisMode(input.mode)) throw new PromptInputError('Analysis mode is invalid.')
  if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > MAX_SOURCES) {
    throw new PromptInputError('Source count is invalid.')
  }

  const labels = new Set<string>()
  let totalBytes = 0
  const envelopes = input.sources.map(source => {
    if (!SOURCE_LABEL_RE.test(source.label) || labels.has(source.label)) throw new PromptInputError('Source label is invalid.')
    if (!Number.isSafeInteger(source.revision) || source.revision < 0) throw new PromptInputError('Source revision is invalid.')
    const title = normalize(source.title)
    const content = normalize(source.content)
    if (!title || !content || Array.from(title).length > 300) throw new PromptInputError('Source content is invalid.')
    totalBytes += Buffer.byteLength(title, 'utf8') + Buffer.byteLength(content, 'utf8')
    labels.add(source.label)
    return `<SOURCE label="${source.label}" revision="${source.revision}" title="${escapeEnvelope(title)}">\n${escapeEnvelope(content)}\n</SOURCE>`
  })
  if (totalBytes > MAX_SOURCE_BYTES) throw new PromptInputError('Combined source size is too large.')

  const additionalRequest = normalize(input.additionalRequest ?? '')
  if (
    Array.from(additionalRequest).length > MAX_ADDITIONAL_REQUEST_CHARS
    || Buffer.byteLength(additionalRequest, 'utf8') > MAX_ADDITIONAL_REQUEST_BYTES
  ) throw new PromptInputError('Additional request is too large.')

  const template = TEMPLATES[input.mode]
  const templateVersion = `${COMMON_PROMPT_VERSION}+${template.version}`
  const systemPrompt = `${COMMON_SYSTEM_RULES}\n\n결과 mode: ${input.mode}\nTemplate version: ${templateVersion}`
  const userPrompt = [
    `분석 지시: ${template.instruction}`,
    additionalRequest ? `사용자 추가 요청(하위 우선순위):\n<ADDITIONAL_REQUEST>\n${escapeEnvelope(additionalRequest)}\n</ADDITIONAL_REQUEST>` : '',
    `SOURCE 목록:\n${envelopes.join('\n\n')}`,
  ].filter(Boolean).join('\n\n')
  const promptHash = createHash('sha256')
    .update(`${systemPrompt}\n\u0000${userPrompt}`, 'utf8')
    .digest('hex')

  return {
    systemPrompt,
    userPrompt,
    sourceLabels: [...labels],
    metadata: { templateVersion, promptHash },
  }
}
