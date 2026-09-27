import { AiProviderError } from './provider-errors'

export const ANALYSIS_MODES = ['summary', 'organize', 'analysis', 'question', 'action_items'] as const
export type AnalysisMode = (typeof ANALYSIS_MODES)[number]

export function isAnalysisMode(value: unknown): value is AnalysisMode {
  return typeof value === 'string' && ANALYSIS_MODES.includes(value as AnalysisMode)
}

export type AnalysisItem = { text: string; sourceLabels: string[] }
export type StructuredAnalysisOutput = {
  version: 1
  mode: AnalysisMode
  title: string
  overview: string
  sections: Array<{ kind: string; heading: string; items: AnalysisItem[] }>
  unknowns: AnalysisItem[]
}

const LIMITS = {
  title: 160,
  overview: 2_000,
  sections: 12,
  heading: 160,
  kind: 64,
  itemsPerSection: 20,
  unknowns: 20,
  itemText: 2_000,
  citationsPerItem: 10,
} as const

const HTML_OR_UNSAFE_URL = /<\/?[a-z][^>]*>|\bon\w+\s*=|(?:javascript|vbscript|data)\s*:/i

function fail(): never {
  throw new AiProviderError('invalid_output')
}

function safeString(value: unknown, maxLength: number, allowEmpty = false) {
  if (typeof value !== 'string') fail()
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if ((!allowEmpty && !normalized) || Array.from(normalized).length > maxLength) fail()
  if (HTML_OR_UNSAFE_URL.test(normalized)) fail()
  return normalized
}

function parseLabels(value: unknown, allowedLabels: ReadonlySet<string>) {
  if (!Array.isArray(value) || value.length > LIMITS.citationsPerItem) fail()
  const labels = value.map(label => {
    if (typeof label !== 'string' || !allowedLabels.has(label)) fail()
    return label
  })
  if (new Set(labels).size !== labels.length) fail()
  return labels
}

function parseItem(value: unknown, allowedLabels: ReadonlySet<string>): AnalysisItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const item = value as Record<string, unknown>
  return {
    text: safeString(item.text, LIMITS.itemText),
    sourceLabels: parseLabels(item.sourceLabels, allowedLabels),
  }
}

export function parseAnalysisOutput(
  value: unknown,
  expectedMode: AnalysisMode,
  allowedSourceLabels: readonly string[],
): StructuredAnalysisOutput {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
    const candidate = value as Record<string, unknown>
    if (candidate.version !== 1 || candidate.mode !== expectedMode) fail()
    if (!Array.isArray(candidate.sections) || candidate.sections.length === 0 || candidate.sections.length > LIMITS.sections) fail()
    if (!Array.isArray(candidate.unknowns) || candidate.unknowns.length > LIMITS.unknowns) fail()
    const allowed = new Set(allowedSourceLabels)

    return {
      version: 1,
      mode: expectedMode,
      title: safeString(candidate.title, LIMITS.title),
      overview: safeString(candidate.overview, LIMITS.overview),
      sections: candidate.sections.map(sectionValue => {
        if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) fail()
        const section = sectionValue as Record<string, unknown>
        if (!Array.isArray(section.items) || section.items.length === 0 || section.items.length > LIMITS.itemsPerSection) fail()
        return {
          kind: safeString(section.kind, LIMITS.kind),
          heading: safeString(section.heading, LIMITS.heading),
          items: section.items.map(item => parseItem(item, allowed)),
        }
      }),
      unknowns: candidate.unknowns.map(item => parseItem(item, allowed)),
    }
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    throw new AiProviderError('invalid_output')
  }
}
