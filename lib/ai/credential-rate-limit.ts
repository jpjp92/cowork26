import 'server-only'

const DEFAULT_WINDOW_MS = 10 * 60 * 1_000
const DEFAULT_MAX_ATTEMPTS = 5
const MAX_ENTRIES = 1_000

type RateLimitEntry = { count: number; resetAt: number }

export class CredentialVerifyRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>()

  constructor(
    private readonly maxAttempts = DEFAULT_MAX_ATTEMPTS,
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  consume(userId: string) {
    const now = this.now()
    const current = this.entries.get(userId)
    if (!current || current.resetAt <= now) {
      this.entries.set(userId, { count: 1, resetAt: now + this.windowMs })
      this.prune(now)
      return { allowed: true as const }
    }
    if (current.count >= this.maxAttempts) {
      return {
        allowed: false as const,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
      }
    }
    current.count += 1
    return { allowed: true as const }
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key)
    }
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }
}

export const credentialVerifyRateLimiter = new CredentialVerifyRateLimiter()
