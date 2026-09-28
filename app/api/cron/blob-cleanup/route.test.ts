// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sweep = vi.hoisted(() => vi.fn())
vi.mock('@/lib/storage/orphans', () => ({ sweepOrphanBlobs: sweep }))

import { GET } from './route'

const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/blob-cleanup', { headers: authorization ? { authorization } : {} }))

describe('GET /api/cron/blob-cleanup', () => {
  beforeEach(() => {
    sweep.mockReset().mockResolvedValue({ checked: 3, deleted: 1, complete: true })
    vi.stubEnv('CRON_SECRET', 'secret')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'token')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('sweeps with the default prefixes and reports the counts', async () => {
    const res = await call('Bearer secret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ checked: 3, deleted: 1, complete: true })
    expect(sweep).toHaveBeenCalledWith()
  })

  it('refuses without the cron secret', async () => {
    expect((await call('Bearer wrong')).status).toBe(401)
    vi.stubEnv('CRON_SECRET', '')
    expect((await call('Bearer ')).status).toBe(503)
    expect(sweep).not.toHaveBeenCalled()
  })

  it('never sweeps outside production, because every environment shares the store', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await call('Bearer secret')).status).toBe(403)
    vi.stubEnv('VERCEL_ENV', '')
    expect((await call('Bearer secret')).status).toBe(403)
    expect(sweep).not.toHaveBeenCalled()
  })

  it('does nothing when storage is not configured', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')
    expect((await call('Bearer secret')).status).toBe(503)
    expect(sweep).not.toHaveBeenCalled()
  })
})
