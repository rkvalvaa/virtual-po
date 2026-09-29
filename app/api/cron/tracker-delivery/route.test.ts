// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deliver = vi.hoisted(() => vi.fn())
vi.mock('@/lib/export/delivery', () => ({ processDeliveries: deliver }))

import { GET } from './route'

const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/tracker-delivery', { headers: authorization ? { authorization } : {} }))

describe('GET /api/cron/tracker-delivery', () => {
  beforeEach(() => { deliver.mockReset().mockResolvedValue({ processed: 2 }); vi.stubEnv('CRON_SECRET', 'secret') })
  afterEach(() => vi.unstubAllEnvs())

  it('delivers what is due and reports how many were processed', async () => {
    const res = await call('Bearer secret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ processed: 2 })
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('refuses without the cron secret', async () => {
    expect((await call('Bearer wrong')).status).toBe(401)
    vi.stubEnv('CRON_SECRET', '')
    expect((await call('Bearer ')).status).toBe(503)
    expect(deliver).not.toHaveBeenCalled()
  })
})
