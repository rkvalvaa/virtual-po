import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { rateLimit, rateLimitHeaders } from './rate-limit'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow the first request for a new key', () => {
    const result = rateLimit('user:test:first', 5, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('should decrement remaining tokens on each call', () => {
    const r1 = rateLimit('user:test:decrement', 3, 60_000)
    const r2 = rateLimit('user:test:decrement', 3, 60_000)
    const r3 = rateLimit('user:test:decrement', 3, 60_000)
    expect(r1.remaining).toBe(2)
    expect(r2.remaining).toBe(1)
    expect(r3.remaining).toBe(0)
  })

  it('should deny requests once the bucket is empty', () => {
    rateLimit('user:test:deny', 2, 60_000)
    rateLimit('user:test:deny', 2, 60_000)
    const denied = rateLimit('user:test:deny', 2, 60_000)
    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
  })

  it('should refill tokens after the full window elapses', () => {
    const key = 'user:test:refill-full'
    rateLimit(key, 2, 60_000)
    rateLimit(key, 2, 60_000)
    const denied = rateLimit(key, 2, 60_000)
    expect(denied.allowed).toBe(false)

    vi.advanceTimersByTime(60_000)

    const refilled = rateLimit(key, 2, 60_000)
    expect(refilled.allowed).toBe(true)
    expect(refilled.remaining).toBe(1)
  })

  it('should partially refill tokens as time elapses within a window', () => {
    const key = 'user:test:refill-partial'
    // Exhaust the bucket
    for (let i = 0; i < 10; i++) rateLimit(key, 10, 60_000)
    expect(rateLimit(key, 10, 60_000).allowed).toBe(false)

    // Advance half the window — should refill ~5 tokens
    vi.advanceTimersByTime(30_000)
    const refilled = rateLimit(key, 10, 60_000)
    expect(refilled.allowed).toBe(true)
    // 5 refilled, minus 1 for this call = 4 remaining
    expect(refilled.remaining).toBe(4)
  })

  it('should cap refilled tokens at the configured limit', () => {
    const key = 'user:test:refill-cap'
    rateLimit(key, 5, 60_000) // consume 1, 4 remaining

    // Advance well beyond a full window — refill should cap at 5, not exceed it
    vi.advanceTimersByTime(60_000 * 10)
    const result = rateLimit(key, 5, 60_000)
    expect(result.remaining).toBe(4) // 5 - 1 (this call) = 4
  })

  it('should isolate buckets across different keys', () => {
    rateLimit('user:test:isolation:a', 2, 60_000)
    rateLimit('user:test:isolation:a', 2, 60_000)
    const aDenied = rateLimit('user:test:isolation:a', 2, 60_000)
    const bAllowed = rateLimit('user:test:isolation:b', 2, 60_000)
    expect(aDenied.allowed).toBe(false)
    expect(bAllowed.allowed).toBe(true)
  })

  it('should compute resetAt within the current window', () => {
    const result = rateLimit('user:test:reset', 5, 60_000)
    const now = Date.now()
    expect(result.resetAt).toBeGreaterThan(now)
    expect(result.resetAt).toBeLessThanOrEqual(now + 60_000)
  })

  it('should respect a custom limit value', () => {
    const result = rateLimit('user:test:custom-limit', 1, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)

    const denied = rateLimit('user:test:custom-limit', 1, 60_000)
    expect(denied.allowed).toBe(false)
  })

  it('should respect a custom window value', () => {
    const key = 'user:test:custom-window'
    rateLimit(key, 1, 1_000)
    const deniedInWindow = rateLimit(key, 1, 1_000)
    expect(deniedInWindow.allowed).toBe(false)

    vi.advanceTimersByTime(1_000)
    const refilled = rateLimit(key, 1, 1_000)
    expect(refilled.allowed).toBe(true)
  })
})

describe('rateLimitHeaders', () => {
  it('should produce standard rate-limit headers from a result', () => {
    const headers = rateLimitHeaders({
      remaining: 42,
      resetAt: 1_700_000_000_000,
      limit: 100,
    })
    expect(headers['X-RateLimit-Limit']).toBe('100')
    expect(headers['X-RateLimit-Remaining']).toBe('42')
    expect(headers['X-RateLimit-Reset']).toBe('1700000000')
  })

  it('should default limit to 100 when not provided', () => {
    const headers = rateLimitHeaders({
      remaining: 0,
      resetAt: 1_700_000_000_000,
    })
    expect(headers['X-RateLimit-Limit']).toBe('100')
  })

  it('should round resetAt up to the next whole second', () => {
    const headers = rateLimitHeaders({
      remaining: 1,
      resetAt: 1_700_000_000_500, // 500ms past second boundary
    })
    expect(headers['X-RateLimit-Reset']).toBe('1700000001')
  })

  it('should stringify all header values', () => {
    const headers = rateLimitHeaders({
      remaining: 7,
      resetAt: 1_700_000_000_000,
      limit: 50,
    })
    expect(typeof headers['X-RateLimit-Limit']).toBe('string')
    expect(typeof headers['X-RateLimit-Remaining']).toBe('string')
    expect(typeof headers['X-RateLimit-Reset']).toBe('string')
  })
})
