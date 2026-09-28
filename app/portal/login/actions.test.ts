import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), ready: true }))
vi.mock('@/auth', () => ({ signIn: mocks.signIn }))
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }))
vi.mock('@/lib/email/config', () => ({ emailReadiness: () => ({ state: mocks.ready ? 'CONFIGURED' : 'UNAVAILABLE' }) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`) } }))

import { requestPortalLink } from './actions'

const submit = (email: string) => {
  const form = new FormData()
  form.set('email', email)
  return requestPortalLink(form)
}

describe('requestPortalLink', () => {
  beforeEach(() => { mocks.signIn.mockReset(); mocks.ready = true })

  it('shows the check-email page whenever Auth.js answers with its verify-request URL', async () => {
    mocks.signIn.mockResolvedValue('http://localhost:3000/api/auth/verify-request?provider=resend&type=email')
    await expect(submit('Kari@Client.example')).rejects.toThrow('REDIRECT /portal/check-email')
    expect(mocks.signIn).toHaveBeenCalledWith('resend', expect.objectContaining({ email: 'kari@client.example', redirect: false }))
  })

  it('does not claim a link is on its way when Auth.js itself fails', async () => {
    mocks.signIn.mockResolvedValue('http://localhost:3000/login?error=Configuration')
    await expect(submit('kari@client.example')).rejects.toThrow('REDIRECT /portal/login?error=unavailable')
  })

  it('answers every address the same when email is not configured, without starting a send', async () => {
    mocks.ready = false
    await expect(submit('kari@client.example')).rejects.toThrow('REDIRECT /portal/login?error=unavailable')
    await expect(submit('nobody@client.example')).rejects.toThrow('REDIRECT /portal/login?error=unavailable')
    expect(mocks.signIn).not.toHaveBeenCalled()
  })

  it('rejects an invalid address', async () => {
    await expect(submit('not-an-email')).rejects.toThrow('REDIRECT /portal/login?error=email')
  })
})
