// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'
import { processEmailOutbox } from '@/lib/email/outbox'

vi.mock('@/lib/email/outbox', () => ({ processEmailOutbox: vi.fn(async () => ({ processed: 3 })) }))

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

it('fails closed when the cron secret is missing', async () => {
  vi.stubEnv('CRON_SECRET', '')
  expect((await GET(new Request('https://example.test/api/cron/email'))).status).toBe(503)
  expect(processEmailOutbox).not.toHaveBeenCalled()
})

it('requires the cron bearer token', async () => {
  vi.stubEnv('CRON_SECRET', 'secret')
  expect((await GET(new Request('https://example.test/api/cron/email', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
  expect(processEmailOutbox).not.toHaveBeenCalled()
})

it('waits for an authenticated delivery batch', async () => {
  vi.stubEnv('CRON_SECRET', 'secret')
  const response = await GET(new Request('https://example.test/api/cron/email', { headers: { authorization: 'Bearer secret' } }))
  expect(await response.json()).toEqual({ processed: 3 })
  expect(processEmailOutbox).toHaveBeenCalledWith({ limit: 20 })
})
