import { beforeEach, describe, expect, it, vi } from 'vitest'

const wrapAuth = vi.hoisted(() => vi.fn((handler: unknown) => handler))
vi.mock('next-auth', () => ({ default: vi.fn(() => ({ auth: wrapAuth })) }))
vi.mock('./auth.config', () => ({ default: {} }))

import { proxy } from './proxy'

type ProxyRequest = { nextUrl: URL; auth: null }
const invoke = (pathname: string) => (proxy as unknown as (request: ProxyRequest) => Response | undefined)({
  nextUrl: new URL(`https://example.test${pathname}`),
  auth: null,
})

describe('proxy machine authentication boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes the exact tracker status cron through to its CRON_SECRET authentication', () => {
    expect(invoke('/api/cron/tracker-status-sync')).toBeUndefined()
  })

  it('does not exempt adjacent tracker paths from browser-session authentication', () => {
    const response = invoke('/api/cron/tracker-status-sync/extra')
    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe('https://example.test/login')
  })
})
