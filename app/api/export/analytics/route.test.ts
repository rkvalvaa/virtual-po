import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

type FakeSession = { user: { id?: string; orgId?: string } } | null
let fakeSession: FakeSession = null

vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(fakeSession),
}))

describe.skipIf(!hasDb())('/api/export/analytics', () => {
  let org: TestOrg
  let user: TestUser
  let GET: typeof import('./route').GET

  beforeAll(async () => {
    org = await createTestOrg('export-analytics-test')
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

  it('should return text/csv with an analytics-prefixed filename', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="analytics-\d{4}-\d{2}-\d{2}\.csv"/,
    )
  })

  it('should include Summary, Status Distribution, and Priority Distribution sections', async () => {
    const res = await GET()
    const csv = await res.text()
    expect(csv).toContain('Summary')
    expect(csv).toContain('Status Distribution')
    expect(csv).toContain('Priority Distribution')
  })

  it('should include the standard Summary metric labels', async () => {
    const res = await GET()
    const csv = await res.text()
    expect(csv).toContain('Total Requests')
    expect(csv).toContain('Pending Review')
    expect(csv).toContain('In Backlog')
    expect(csv).toContain('Completed')
    expect(csv).toContain('Avg Quality Score')
    expect(csv).toContain('Avg Time to Decision (days)')
  })

  it('should separate sections with a blank CRLF', async () => {
    const res = await GET()
    const csv = await res.text()
    // Each section is joined with '\r\n\r\n'.
    expect(csv).toContain('\r\n\r\n')
  })

  it('should reflect the actual total request count for the org', async () => {
    const { createFeatureRequest } = await import('@/lib/db/queries/feature-requests')
    await createFeatureRequest(org.id, user.id, 'one')
    await createFeatureRequest(org.id, user.id, 'two')
    await createFeatureRequest(org.id, user.id, 'three')

    const res = await GET()
    const csv = await res.text()
    expect(csv).toMatch(/Total Requests,3/)
  })
})
