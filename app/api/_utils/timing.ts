const ENABLE_API_TIMING = process.env.NODE_ENV !== 'production'

function formatMs(value: number) {
  return `${Math.round(value)}ms`
}

function formatMb(value: number) {
  return `${Math.round(value / 1024 / 1024)}MB`
}

export class ApiTiming {
  private readonly start = performance.now()
  private readonly spans: Array<{ label: string; duration: number }> = []

  constructor(private readonly label: string) {}

  async measure<T>(label: string, action: () => T | PromiseLike<T>): Promise<Awaited<T>> {
    if (!ENABLE_API_TIMING) return await action()

    const startedAt = performance.now()
    try {
      return await action()
    } finally {
      this.spans.push({ label, duration: performance.now() - startedAt })
    }
  }

  mark(label: string, startedAt: number) {
    if (!ENABLE_API_TIMING) return
    this.spans.push({ label, duration: performance.now() - startedAt })
  }

  log(extra?: Record<string, string | number | boolean | null | undefined>) {
    if (!ENABLE_API_TIMING) return

    const total = performance.now() - this.start
    const spanText = this.spans
      .map(span => `${span.label}=${formatMs(span.duration)}`)
      .join(' ')
    const extraText = extra
      ? Object.entries(extra)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(' ')
      : ''

    const memory = process.memoryUsage()
    const memoryText = `rss=${formatMb(memory.rss)} heap=${formatMb(memory.heapUsed)}`

    console.log(
      ['[api-timing]', this.label, spanText, extraText, memoryText, `total=${formatMs(total)}`]
        .filter(Boolean)
        .join(' ')
    )
  }
}

export function createApiTiming(label: string) {
  return new ApiTiming(label)
}
