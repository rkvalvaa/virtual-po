import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const getToken = vi.hoisted(() => vi.fn())
vi.mock('next-auth/jwt', () => ({ getToken }))

import { proxy } from './proxy'

const invoke = (pathname: string, cookies: string[] = []) => proxy({
  nextUrl: new URL(`https://example.test${pathname}`),
  cookies: { getAll: () => cookies.map(name => ({ name, value: 'x' })) },
  headers: new Headers(),
} as unknown as NextRequest)

describe('proxy machine authentication boundary', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.AUTH_SECRET = 'test-secret'; getToken.mockResolvedValue(null) })

  it('passes the exact tracker status cron through to its CRON_SECRET authentication', async () => {
    expect(await invoke('/api/cron/tracker-status-sync')).toBeUndefined()
    expect(getToken).not.toHaveBeenCalled()
  })

  it('does not exempt adjacent tracker paths from browser-session authentication', async () => {
    const response = await invoke('/api/cron/tracker-status-sync/extra')
    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe('https://example.test/login')
  })
})

describe('proxy session check', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.AUTH_SECRET = 'test-secret' })

  it('refuses to gate protected routes without AUTH_SECRET', async () => {
    delete process.env.AUTH_SECRET
    await expect(invoke('/requests')).rejects.toThrow('AUTH_SECRET is required')
    expect(getToken).not.toHaveBeenCalled()
  })

  it('admits a valid session', async () => {
    getToken.mockResolvedValue({ id: 'user' })
    expect(await invoke('/requests')).toBeUndefined()
  })

  it('decodes the secure cookie variant when present, including chunked cookies', async () => {
    getToken.mockResolvedValue({ id: 'user' })
    await invoke('/requests', ['__Secure-authjs.session-token.0', '__Secure-authjs.session-token.1'])
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: true }))
    await invoke('/requests', ['authjs.session-token'])
    expect(getToken).toHaveBeenLastCalledWith(expect.objectContaining({ secureCookie: false }))
  })
})

describe('proxy client portal boundary', () => {
  const clientToken = { id: 'u2', orgId: null, clientContactId: 'contact-1', clientAccountId: 'acct-1' }
  const memberToken = { id: 'u1', orgId: 'org-1', role: 'REVIEWER' }
  beforeEach(() => { vi.clearAllMocks(); process.env.AUTH_SECRET = 'test-secret' })

  it.each(['/portal', '/portal/requests'])('admits a client session to %s', async (path) => {
    getToken.mockResolvedValue(clientToken)
    expect(await invoke(path)).toBeUndefined()
  })

  it.each(['/requests', '/settings', '/portalish'])('redirects a client session away from %s to the portal', async (path) => {
    getToken.mockResolvedValue(clientToken)
    const response = await invoke(path)
    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe('https://example.test/portal')
  })

  it('refuses session-authenticated APIs to a client session', async () => {
    getToken.mockResolvedValue(clientToken)
    expect((await invoke('/api/export/requests'))?.status).toBe(403)
    expect((await invoke('/api/attachments/abc'))?.status).toBe(403)
  })

  it('leaves auth routes, public pages and machine APIs to their own checks', async () => {
    getToken.mockResolvedValue(clientToken)
    expect(await invoke('/api/auth/session')).toBeUndefined()
    expect(await invoke('/')).toBeUndefined()
    expect(await invoke('/api/v1/requests')).toBeUndefined()
  })

  it('sends a workspace member on the portal back to the workspace', async () => {
    getToken.mockResolvedValue(memberToken)
    const response = await invoke('/portal')
    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe('https://example.test/requests')
  })

  it('sends a visitor without a session on the portal to the portal sign-in', async () => {
    getToken.mockResolvedValue(null)
    const response = await invoke('/portal')
    expect(response?.headers.get('location')).toBe('https://example.test/portal/login')
  })

  it('serves the portal sign-in page without a session', async () => {
    getToken.mockResolvedValue(null)
    expect(await invoke('/portal/login')).toBeUndefined()
  })
})
