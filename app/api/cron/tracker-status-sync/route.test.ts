// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'
import { runDueLinearStatusSyncs } from '@/lib/status-sync/linear'

vi.mock('@/lib/status-sync/linear', () => ({
  runDueLinearStatusSyncs: vi.fn(async () => [
    { configId: 'ok', success: true },
    { configId: 'revoked', success: false, error: 'Linear credentials are unavailable or revoked.' },
  ]),
}))

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

it('fails closed without configured cron authentication', async () => {
  vi.stubEnv('CRON_SECRET', '')
  expect((await GET(new Request('https://example.test/api/cron/tracker-status-sync'))).status).toBe(503)
  expect(runDueLinearStatusSyncs).not.toHaveBeenCalled()
})

it('rejects the wrong bearer token', async () => {
  vi.stubEnv('CRON_SECRET', 'secret')
  expect((await GET(new Request('https://example.test/api/cron/tracker-status-sync', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
  expect(runDueLinearStatusSyncs).not.toHaveBeenCalled()
})

it('runs the authenticated incremental sweep and reports per-config failures', async () => {
  vi.stubEnv('CRON_SECRET', 'secret')
  const response = await GET(new Request('https://example.test/api/cron/tracker-status-sync', { headers: { authorization: 'Bearer secret' } }))
  expect(await response.json()).toEqual({ processed: 2, succeeded: 1, failed: 1 })
  expect(runDueLinearStatusSyncs).toHaveBeenCalledTimes(1)
})
