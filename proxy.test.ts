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
  beforeEach(() => { vi.clearAllMocks(); getToken.mockResolvedValue(null) })

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
