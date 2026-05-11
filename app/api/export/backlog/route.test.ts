import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'
import type { RequestStatus } from '@/lib/types/database'

type FakeSession = { user: { id?: string; orgId?: string } } | null
let fakeSession: FakeSession = null

vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(fakeSession),
}))

async function setRequestStatus(id: string, status: RequestStatus): Promise<void> {
  const { query } = await import('@/lib/db/pool')
  await query(`UPDATE feature_requests SET status = $1 WHERE id = $2`, [status, id])
}

describe.skipIf(!hasDb())('/api/export/backlog', () => {
  let org: TestOrg
  let user: TestUser
  let GET: typeof import('./route').GET

  beforeAll(async () => {
    org = await createTestOrg('export-backlog-test')
    user = await createTestUser(org)
    GET = (await import('./route')).GET
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id])
  })

  beforeEach(async () => {
    fakeSession = { user: { id: user.id, orgId: org.id } }
    const { query } = await import('@/lib/db/pool')
    await query(`DELETE FROM feature_requests WHERE organization_id = $1`, [org.id])
  })

  it('should return 401 when there is no session', async () => {
    fakeSession = null
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('should return 400 when the session has no orgId', async () => {
    fakeSession = { user: { id: user.id } }
    const res = await GET()
    expect(res.status).toBe(400)
  })

  it('should return text/csv with a backlog-prefixed filename', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="backlog-\d{4}-\d{2}-\d{2}\.csv"/,
    )
  })

  it('should only include APPROVED, IN_BACKLOG, IN_PROGRESS, COMPLETED requests', async () => {
    const { createFeatureRequest } = await import('@/lib/db/queries/feature-requests')

    // Eligible
    const approved = await createFeatureRequest(org.id, user.id, 'A-approved')
    await setRequestStatus(approved.id, 'APPROVED')
    const inBacklog = await createFeatureRequest(org.id, user.id, 'B-inbacklog')
    await setRequestStatus(inBacklog.id, 'IN_BACKLOG')
    const inProgress = await createFeatureRequest(org.id, user.id, 'C-inprogress')
    await setRequestStatus(inProgress.id, 'IN_PROGRESS')
    const completed = await createFeatureRequest(org.id, user.id, 'D-completed')
    await setRequestStatus(completed.id, 'COMPLETED')

    // Ineligible
    await createFeatureRequest(org.id, user.id, 'X-draft')
    const rejected = await createFeatureRequest(org.id, user.id, 'X-rejected')
    await setRequestStatus(rejected.id, 'REJECTED')
    const deferred = await createFeatureRequest(org.id, user.id, 'X-deferred')
    await setRequestStatus(deferred.id, 'DEFERRED')

    const res = await GET()
    const csv = await res.text()

    expect(csv).toContain('A-approved')
    expect(csv).toContain('B-inbacklog')
    expect(csv).toContain('C-inprogress')
    expect(csv).toContain('D-completed')

    expect(csv).not.toContain('X-draft')
    expect(csv).not.toContain('X-rejected')
    expect(csv).not.toContain('X-deferred')
  })

  it('should produce a header-only CSV when nothing is in the backlog', async () => {
    const res = await GET()
    const csv = await res.text()
    expect(csv.split('\r\n')).toHaveLength(1)
  })
})
