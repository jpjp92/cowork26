import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CredentialVerifyRateLimiter } from '../../lib/ai/credential-rate-limit'

describe('CredentialVerifyRateLimiter', () => {
  it('limits each user independently and reports a retry delay', () => {
    let now = 1_000
    const limiter = new CredentialVerifyRateLimiter(2, 10_000, () => now)
    expect(limiter.consume('user-1')).toEqual({ allowed: true })
    expect(limiter.consume('user-1')).toEqual({ allowed: true })
    expect(limiter.consume('user-2')).toEqual({ allowed: true })
    expect(limiter.consume('user-1')).toEqual({ allowed: false, retryAfterSeconds: 10 })

    now += 10_000
    expect(limiter.consume('user-1')).toEqual({ allowed: true })
  })
})
