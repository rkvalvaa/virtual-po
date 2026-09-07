import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Organization, ReviewCycle } from '@/lib/types/database'

let fakeOrgs: Organization[] = []
const runReviewCycleMock = vi.fn()
const isCycleDueMock = vi.fn()

vi.mock('@/lib/db/queries/organizations', () => ({
  listOrganizations: () => Promise.resolve(fakeOrgs),
}))

vi.mock('@/lib/db/queries/review-cycles', () => ({
  getLatestReviewCycle: () => Promise.resolve(null),
}))

vi.mock('@/lib/review-cycles/engine', () => ({
  isCycleDue: (...args: unknown[]) => isCycleDueMock(...args),
  runReviewCycle: (...args: unknown[]) => runReviewCycleMock(...args),
}))

import { GET } from './route'

function makeOrg(id: string, settings: Record<string, unknown>): Organization {
  return {
    id,
    name: `org-${id}`,
    slug: `org-${id}`,
    settings,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeCycle(orgId: string, requeuedCount: number): ReviewCycle {
  return {
    id: `cycle-${orgId}`,
    organizationId: orgId,
    startedAt: new Date(),
    requeuedCount,
    requeuedRequestIds: [],
    triggeredBy: 'CRON',
    triggeredByUserId: null,
  }
}

function makeRequest(authorization?: string): Request {
  return new Request('http://localhost/api/cron/review-cycles', {
    headers: authorization ? { authorization } : {},
  })
}

const enabled = { reviewCycle: { enabled: true, cadence: 'WEEKLY', dayOfWeek: 1 } }

describe('GET /api/cron/review-cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeOrgs = []
    isCycleDueMock.mockReturnValue(true)
    runReviewCycleMock.mockImplementation((params: { orgId: string }) =>
      Promise.resolve(makeCycle(params.orgId, 2))
    )
    vi.stubEnv('CRON_SECRET', 'test-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should return 503 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(503)
    expect(runReviewCycleMock).not.toHaveBeenCalled()
  })

  it('should return 401 when the Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(runReviewCycleMock).not.toHaveBeenCalled()
  })

  it('should return 401 for a wrong bearer token', async () => {
    const res = await GET(makeRequest('Bearer nope'))
    expect(res.status).toBe(401)
    expect(runReviewCycleMock).not.toHaveBeenCalled()
  })

  it('should run due orgs and return their ids', async () => {
    fakeOrgs = [makeOrg('org-1', enabled), makeOrg('org-2', enabled)]
    const res = await GET(makeRequest('Bearer test-secret'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ran: ['org-1', 'org-2'] })
    expect(runReviewCycleMock).toHaveBeenCalledTimes(2)
    expect(runReviewCycleMock).toHaveBeenCalledWith({
      orgId: 'org-1',
      triggeredBy: 'CRON',
    })
  })

  it('should skip orgs whose review cycle is disabled', async () => {
    fakeOrgs = [makeOrg('org-off', {}), makeOrg('org-on', enabled)]
    const res = await GET(makeRequest('Bearer test-secret'))

    await expect(res.json()).resolves.toEqual({ ran: ['org-on'] })
    expect(runReviewCycleMock).toHaveBeenCalledTimes(1)
  })

  it('should skip orgs whose cycle is not due yet', async () => {
    fakeOrgs = [makeOrg('org-1', enabled)]
    isCycleDueMock.mockReturnValue(false)

    const res = await GET(makeRequest('Bearer test-secret'))
    await expect(res.json()).resolves.toEqual({ ran: [] })
    expect(runReviewCycleMock).not.toHaveBeenCalled()
  })

  it('should keep sweeping when one org fails', async () => {
    fakeOrgs = [makeOrg('org-bad', enabled), makeOrg('org-good', enabled)]
    runReviewCycleMock.mockImplementationOnce(() =>
      Promise.reject(new Error('boom'))
    )

    const res = await GET(makeRequest('Bearer test-secret'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ran: ['org-good'] })
  })
})
