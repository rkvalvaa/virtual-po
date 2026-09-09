// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'
import { processTeamsOutbox } from '@/lib/teams/outbox'

vi.mock('@/lib/teams/outbox', () => ({ processTeamsOutbox: vi.fn(async () => ({ processed: 2 })) }))
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

it('requires the cron bearer token before processing Teams work', async () => {
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  expect((await GET(new Request('https://example.test/api/cron/teams'))).status).toBe(401)
  expect(processTeamsOutbox).not.toHaveBeenCalled()
  const response = await GET(new Request('https://example.test/api/cron/teams', { headers: { authorization: 'Bearer cron-secret' } }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ processed: 2 })
})
