import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifySlackRequest } from './verify'

const SECRET = 'shhh-this-is-the-signing-secret'

function signed(body: string, secret: string, timestamp: number): string {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')
  return `v0=${hmac}`
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

describe('verifySlackRequest', () => {
  describe('configuration guards', () => {
    it('should fail with no_signing_secret when secret is undefined', () => {
      const result = verifySlackRequest('', {}, undefined)
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('no_signing_secret')
    })

    it('should fail with no_signing_secret when secret is an empty string', () => {
      const result = verifySlackRequest('', {}, '')
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('no_signing_secret')
    })
  })

  describe('header validation', () => {
    it('should fail with missing_headers when both headers are absent', () => {
      const result = verifySlackRequest('body', {}, SECRET)
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('missing_headers')
    })

    it('should fail with missing_headers when only signature is present', () => {
      const result = verifySlackRequest(
        'body',
        { 'x-slack-signature': 'v0=abc' },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('missing_headers')
    })

    it('should fail with missing_headers when only timestamp is present', () => {
      const result = verifySlackRequest(
        'body',
        { 'x-slack-request-timestamp': String(nowSeconds()) },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('missing_headers')
    })

    it('should fail with missing_headers when timestamp is not numeric', () => {
      const result = verifySlackRequest(
        'body',
        {
          'x-slack-request-timestamp': 'not-a-number',
          'x-slack-signature': 'v0=abc',
        },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('missing_headers')
    })

    it('should accept headers from a real Headers instance', () => {
      const ts = nowSeconds()
      const body = '{"type":"event_callback"}'
      const headers = new Headers({
        'x-slack-request-timestamp': String(ts),
        'x-slack-signature': signed(body, SECRET, ts),
      })
      expect(verifySlackRequest(body, headers, SECRET).ok).toBe(true)
    })

    it('should look up headers case-insensitively in plain objects', () => {
      const ts = nowSeconds()
      const body = 'hi'
      const result = verifySlackRequest(
        body,
        {
          'X-Slack-Request-Timestamp': String(ts),
          'X-Slack-Signature': signed(body, SECRET, ts),
        },
        SECRET,
      )
      expect(result.ok).toBe(true)
    })
  })

  describe('timestamp staleness', () => {
    it('should reject requests older than 5 minutes', () => {
      const sixMinAgo = nowSeconds() - 6 * 60
      const body = 'old'
      const result = verifySlackRequest(
        body,
        {
          'x-slack-request-timestamp': String(sixMinAgo),
          'x-slack-signature': signed(body, SECRET, sixMinAgo),
        },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('stale_timestamp')
    })

    it('should reject future timestamps more than 5 minutes ahead', () => {
      const future = nowSeconds() + 6 * 60
      const body = 'future'
      const result = verifySlackRequest(
        body,
        {
          'x-slack-request-timestamp': String(future),
          'x-slack-signature': signed(body, SECRET, future),
        },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('stale_timestamp')
    })

    it('should accept timestamps within the 5-minute window', () => {
      const recent = nowSeconds() - 2 * 60
      const body = 'recent'
      const result = verifySlackRequest(
        body,
        {
          'x-slack-request-timestamp': String(recent),
          'x-slack-signature': signed(body, SECRET, recent),
        },
        SECRET,
      )
      expect(result.ok).toBe(true)
    })
  })

  describe('signature comparison', () => {
    it('should accept a correctly signed request', () => {
      const ts = nowSeconds()
      const body = JSON.stringify({ hello: 'world' })
      const result = verifySlackRequest(
        body,
        {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': signed(body, SECRET, ts),
        },
        SECRET,
      )
      expect(result.ok).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('should reject a request whose body has been tampered with', () => {
      const ts = nowSeconds()
      const body = 'original'
      const signature = signed(body, SECRET, ts)
      const result = verifySlackRequest(
        'tampered',
        {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': signature,
        },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('bad_signature')
    })

    it('should reject a request signed with a different secret', () => {
      const ts = nowSeconds()
      const body = 'body'
      const wrongSig = signed(body, 'different-secret', ts)
      const result = verifySlackRequest(
        body,
        {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': wrongSig,
        },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('bad_signature')
    })

    it('should reject a signature of the wrong length without throwing', () => {
      const ts = nowSeconds()
      const result = verifySlackRequest(
        'body',
        {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': 'v0=short',
        },
        SECRET,
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('bad_signature')
    })
  })

  describe('replay protection', () => {
    it('should reject a captured request replayed from far in the past', () => {
      // Simulate "now" being 10 minutes after the captured request.
      const captured = nowSeconds()
      const body = JSON.stringify({ action: 'something' })
      const result = verifySlackRequest(
        body,
        {
          'x-slack-request-timestamp': String(captured),
          'x-slack-signature': signed(body, SECRET, captured),
        },
        SECRET,
        new Date((captured + 10 * 60) * 1000),
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('stale_timestamp')
    })
  })
})
