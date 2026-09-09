// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emailReadiness, getApplicationBaseUrl } from './config'

describe('email configuration', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses one validated application origin for all email links', () => {
    vi.stubEnv('APP_URL', 'https://vpo.example.test/some/path')
    vi.stubEnv('AUTH_URL', 'https://ignored.example.test')
    expect(getApplicationBaseUrl()).toBe('https://vpo.example.test')
  })

  it('rejects unsafe or credential-bearing public URLs', () => {
    vi.stubEnv('APP_URL', 'http://vpo.example.test')
    expect(() => getApplicationBaseUrl()).toThrow('HTTPS')
    vi.stubEnv('APP_URL', 'https://user:secret@vpo.example.test')
    expect(() => getApplicationBaseUrl()).toThrow('credentials')
  })

  it('returns safe unavailable metadata without credentials', () => {
    vi.stubEnv('RESEND_API_KEY', 'super-secret')
    vi.stubEnv('EMAIL_FROM', '')
    vi.stubEnv('APP_URL', 'https://vpo.example.test')
    const readiness = emailReadiness()
    expect(readiness.state).toBe('UNAVAILABLE')
    expect(JSON.stringify(readiness)).not.toContain('super-secret')
  })

  it('reports configured sender and origin without exposing the API key', () => {
    vi.stubEnv('RESEND_API_KEY', 'super-secret')
    vi.stubEnv('EMAIL_FROM', 'Virtual PO <notifications@example.test>')
    vi.stubEnv('APP_URL', 'https://vpo.example.test')
    expect(emailReadiness()).toEqual({
      state: 'CONFIGURED',
      provider: 'Resend',
      sender: 'Virtual PO <notifications@example.test>',
      applicationUrl: 'https://vpo.example.test',
      message: 'Email is configured. Use the test below to verify provider acceptance.',
    })
  })
})
