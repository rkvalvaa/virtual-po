import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
  type TestRequest,
} from '@/test/db-helpers'

type FakeSession = { user: { id?: string; orgId?: string } } | null
let fakeSession: FakeSession = null

vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(fakeSession),
}))

function makeCtx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe.skipIf(!hasDb())('/api/export/requests/[id]/pdf', () => {
  let org: TestOrg
  let user: TestUser
  let request: TestRequest
  let otherOrg: TestOrg
  let otherUser: TestUser
  let otherRequest: TestRequest
  let GET: typeof import('./route').GET

  beforeAll(async () => {
    org = await createTestOrg('pdf-route-test')
    user = await createTestUser(org)
    request = await createTestRequest(org, user, 'PDF test request')

    otherOrg = await createTestOrg('pdf-other-org')
    otherUser = await createTestUser(otherOrg)
    otherRequest = await createTestRequest(otherOrg, otherUser, 'Their request')

    GET = (await import('./route')).GET
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id])
    await cleanupTestOrg(otherOrg, [otherUser.id])
  })

  beforeEach(() => {
    fakeSession = { user: { id: user.id, orgId: org.id } }
  })

  it('should return 401 when there is no session', async () => {
    fakeSession = null
    const res = await GET(new Request('http://localhost/'), makeCtx(request.id))
    expect(res.status).toBe(401)
  })

  it('should return 400 when session has no orgId', async () => {
    fakeSession = { user: { id: user.id } }
    const res = await GET(new Request('http://localhost/'), makeCtx(request.id))
    expect(res.status).toBe(400)
  })

  it('should return 404 for a non-existent id', async () => {
    const res = await GET(
      new Request('http://localhost/'),
      makeCtx('00000000-0000-0000-0000-000000000000'),
    )
    expect(res.status).toBe(404)
  })

  it('should return 403 for a request owned by another org', async () => {
    const res = await GET(new Request('http://localhost/'), makeCtx(otherRequest.id))
    expect(res.status).toBe(403)
  })

  it('should return a PDF with the right Content-Type and Content-Disposition', async () => {
    const res = await GET(new Request('http://localhost/'), makeCtx(request.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="pdf-test-request-\d{4}-\d{2}-\d{2}\.pdf"/,
    )
  })

  it('should return body bytes starting with the PDF magic header', async () => {
    const res = await GET(new Request('http://localhost/'), makeCtx(request.id))
    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const header = new TextDecoder().decode(bytes.slice(0, 5))
    expect(header).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(500)
  })
})
