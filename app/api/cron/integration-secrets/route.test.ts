// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reencrypt = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/queries/integration-secrets', () => ({ reencryptIntegrationSecrets: reencrypt }))

import { GET } from './route'

const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/integration-secrets', { headers: authorization ? { authorization } : {} }))

describe('GET /api/cron/integration-secrets', () => {
  beforeEach(() => {
    reencrypt.mockReset().mockResolvedValue({ scanned: 4, reencrypted: 2, failed: 0 })
    vi.stubEnv('CRON_SECRET', 'secret')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('re-encrypts stale secrets and reports the counts', async () => {
    const res = await call('Bearer secret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ scanned: 4, reencrypted: 2, failed: 0 })
  })

  it('refuses without the cron secret', async () => {
    expect((await call('Bearer wrong')).status).toBe(401)
    vi.stubEnv('CRON_SECRET', '')
    expect((await call('Bearer ')).status).toBe(503)
    expect(reencrypt).not.toHaveBeenCalled()
  })

  it('reports failure when some rows could not be decrypted', async () => {
    reencrypt.mockResolvedValue({ scanned: 4, reencrypted: 1, failed: 1 })
    expect((await call('Bearer secret')).status).toBe(500)
  })
})
