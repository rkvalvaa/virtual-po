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

describe.skipIf(!hasDb())('/api/export/requests', () => {
  let org: TestOrg
  let user: TestUser
  let GET: typeof import('./route').GET

  beforeAll(async () => {
    org = await createTestOrg('export-requests-test')
    user = await createTestUser(org)
    // Import the route AFTER vi.mock is registered.
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
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('should return 400 when the session has no orgId', async () => {
    fakeSession = { user: { id: user.id } }
    const res = await GET()
    expect(res.status).toBe(400)
  })

  it('should return text/csv with a date-stamped filename', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    const today = new Date().toISOString().slice(0, 10)
    expect(res.headers.get('Content-Disposition')).toBe(
      `attachment; filename="requests-${today}.csv"`,
    )
  })

  it('should produce a header-only CSV when the org has no requests', async () => {
    const res = await GET()
    const csv = await res.text()
    expect(csv.startsWith('Title,Status,Priority Score,Quality Score,Complexity,Tags,Created At,Updated At')).toBe(true)
    // Header line only — no data rows.
    expect(csv.split('\r\n')).toHaveLength(1)
  })

  it('should include one CSV row per request with the title in the first column', async () => {
    const { createFeatureRequest } = await import('@/lib/db/queries/feature-requests')
    await createFeatureRequest(org.id, user.id, 'First request')
    await createFeatureRequest(org.id, user.id, 'Second request')

    const res = await GET()
    const csv = await res.text()
    const lines = csv.split('\r\n')
    // 1 header + 2 rows
    expect(lines).toHaveLength(3)
    // Order is newest-first per listFeatureRequests; both titles must appear.
    expect(csv).toContain('First request')
    expect(csv).toContain('Second request')
  })

  it('should CSV-escape titles containing commas and quotes', async () => {
    const { createFeatureRequest } = await import('@/lib/db/queries/feature-requests')
    await createFeatureRequest(org.id, user.id, 'Title, with "quotes"')

    const res = await GET()
    const csv = await res.text()
    expect(csv).toContain('"Title, with ""quotes"""')
  })
})
