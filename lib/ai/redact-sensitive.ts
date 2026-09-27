import 'server-only'

const REDACTED = '[REDACTED]'
const CIRCULAR = '[Circular]'
const MAX_DEPTH_VALUE = '[MaxDepth]'

const SENSITIVE_FIELD_RE = /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-goog-api-key|api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|credential|password|ciphertext|nonce|auth[-_]?tag|prompt|messages?|input|body|content|source)$/i

const STRING_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)=([^\s&]+)/gi,
]

export type RedactionOptions = {
  secrets?: Iterable<string>
  maxDepth?: number
}

function redactString(value: string, secrets: string[]) {
  let redacted = value
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join(REDACTED)
  }
  for (const pattern of STRING_PATTERNS) {
    redacted = redacted.replace(pattern, match => {
      const separator = match.indexOf('=')
      return separator >= 0 ? `${match.slice(0, separator + 1)}${REDACTED}` : REDACTED
    })
  }
  return redacted
}

export function redactSensitive(value: unknown, options: RedactionOptions = {}): unknown {
  const secrets = Array.from(options.secrets ?? []).filter(Boolean).sort((a, b) => b.length - a.length)
  const maxDepth = options.maxDepth ?? 8
  const seen = new WeakSet<object>()

  const visit = (current: unknown, depth: number, fieldName?: string): unknown => {
    if (fieldName && SENSITIVE_FIELD_RE.test(fieldName)) return REDACTED
    if (typeof current === 'string') return redactString(current, secrets)
    if (current === null || typeof current === 'number' || typeof current === 'boolean') return current
    if (typeof current === 'bigint') return current.toString()
    if (current === undefined) return undefined
    if (typeof current === 'function') return '[Function]'
    if (typeof current === 'symbol') return current.toString()
    if (depth >= maxDepth) return MAX_DEPTH_VALUE
    if (typeof current !== 'object') return String(current)
    if (seen.has(current)) return CIRCULAR
    seen.add(current)

    if (current instanceof Date) return current.toISOString()
    if (current instanceof Headers) {
      return Object.fromEntries(
        Array.from(current.entries(), ([key, headerValue]) => [key, visit(headerValue, depth + 1, key)]),
      )
    }
    if (current instanceof Error) {
      return {
        name: current.name,
        message: redactString(current.message, secrets),
        cause: visit(current.cause, depth + 1, 'cause'),
      }
    }
    if (Array.isArray(current)) {
      return current.map(item => visit(item, depth + 1))
    }

    const output: Record<string, unknown> = {}
    for (const key of Object.keys(current)) {
      try {
        output[key] = visit((current as Record<string, unknown>)[key], depth + 1, key)
      } catch {
        output[key] = '[Unserializable]'
      }
    }
    return output
  }

  return visit(value, 0)
}

export function safeLogJson(value: unknown, options?: RedactionOptions) {
  return JSON.stringify(redactSensitive(value, options))
}
