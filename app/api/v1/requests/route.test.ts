import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { GET, POST } from './route'
import {
  hasDb,
  createTestOrg,
  createTestApiKey,
  cleanupTestOrg,
  type TestOrg,
} from '@/test/db-helpers'

function makeRequest(
  options: {
    method?: 'GET' | 'POST'
    apiKey?: string
    url?: string
    body?: unknown
  } = {},
): Request {
  const headers: Record<string, string> = {}
  if (options.apiKey) headers['Authorization'] = `Bearer ${options.apiKey}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  return new Request(options.url ?? 'http://localhost/api/v1/requests', {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
}

describe.skipIf(!hasDb())('/api/v1/requests', () => {
  let org: TestOrg
  let readKey: string
  let writeKey: string

  beforeAll(async () => {
    org = await createTestOrg('v1-requests-test')
    readKey = (await createTestApiKey(org, ['read'])).key
    writeKey = (await createTestApiKey(org, ['write'])).key
  })

  afterAll(async () => {
    await cleanupTestOrg(org)
  })

  beforeEach(async () => {
    // Reset feature_requests in this org so list assertions stay deterministic.
    const { query } = await import('@/lib/db/pool')
    await query(`DELETE FROM feature_requests WHERE organization_id = $1`, [org.id])
  })

  describe('GET — authentication', () => {
    it('should return 401 when no Authorization header is present', async () => {
      const res = await GET(makeRequest())
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('should return 401 for a bogus API key', async () => {
      const res = await GET(makeRequest({ apiKey: 'vpo_thisisnotreal' }))
      expect(res.status).toBe(401)
    })

    it('should return 200 with a valid read key', async () => {
      const res = await GET(makeRequest({ apiKey: readKey }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ data: [], total: 0, limit: 50, offset: 0 })
    })

    it('should accept a write-scoped key (write implies read)', async () => {
      const res = await GET(makeRequest({ apiKey: writeKey }))
      expect(res.status).toBe(200)
    })
  })

  describe('GET — listing and filtering', () => {
    it('should return all requests in the org', async () => {
      const { createFeatureRequest } = await import('@/lib/db/queries/feature-requests')
      await createFeatureRequest(org.id, '00000000-0000-0000-0000-000000000000', 'A')
      await createFeatureRequest(org.id, '00000000-0000-0000-0000-000000000000', 'B')

      const res = await GET(makeRequest({ apiKey: readKey }))
      const body = await res.json()
      expect(body.total).toBe(2)
      expect(body.data).toHaveLength(2)
    })

    it('should filter by ?status=DRAFT', async () => {
      const { createFeatureRequest } = await import('@/lib/db/queries/feature-requests')
      const { query } = await import('@/lib/db/pool')
      const a = await createFeatureRequest(org.id, '00000000-0000-0000-0000-000000000000', 'A')
      await createFeatureRequest(org.id, '00000000-0000-0000-0000-000000000000', 'B')
      await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [a.id])

      const res = await GET(makeRequest({
        apiKey: readKey,
        url: 'http://localhost/api/v1/requests?status=DRAFT',
      }))
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].title).toBe('B')
    })

    it('should reject an invalid status with 400', async () => {
      const res = await GET(makeRequest({
        apiKey: readKey,
        url: 'http://localhost/api/v1/requests?status=NOPE',
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('INVALID_PARAMETER')
    })

    it('should cap limit at 100 even when caller requests more', async () => {
      const res = await GET(makeRequest({
        apiKey: readKey,
        url: 'http://localhost/api/v1/requests?limit=500',
      }))
      const body = await res.json()
      expect(body.limit).toBe(100)
    })

    it('should include X-RateLimit-* headers on successful responses', async () => {
      const res = await GET(makeRequest({ apiKey: readKey }))
      expect(res.headers.get('X-RateLimit-Limit')).toBe('100')
      expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy()
      expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy()
    })
  })

  describe('POST — authentication and authorization', () => {
    it('should return 401 with no API key', async () => {
      const res = await POST(makeRequest({ method: 'POST', body: { title: 'x' } }))
      expect(res.status).toBe(401)
    })

    it('should return 403 when called with a read-only key (insufficient scope)', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: readKey,
        body: { title: 'x' },
      }))
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('FORBIDDEN')
    })
  })

  describe('POST — validation', () => {
    it('should return 400 for invalid JSON body', async () => {
      const req = new Request('http://localhost/api/v1/requests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${writeKey}`, 'Content-Type': 'application/json' },
        body: '{not valid json',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('INVALID_BODY')
    })

    it('should return 400 when title is missing', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: writeKey,
        body: { summary: 'no title here' },
      }))
      expect(res.status).toBe(400)
    })

    it('should return 400 when title is an empty string', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: writeKey,
        body: { title: '   ' },
      }))
      expect(res.status).toBe(400)
    })

    it('should return 400 when title is not a string', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: writeKey,
        body: { title: 42 },
      }))
      expect(res.status).toBe(400)
    })
  })

  describe('POST — creation', () => {
    it('should create a request and return 201 with the new record', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: writeKey,
        body: { title: '  Add dark mode  ' },
      }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.title).toBe('Add dark mode') // trimmed
      expect(body.data.organizationId).toBe(org.id)
      expect(body.data.status).toBe('DRAFT')
    })

    it('should store summary when provided', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: writeKey,
        body: { title: 'New feature', summary: 'Helpful context' },
      }))
      const body = await res.json()
      expect(body.data.summary).toBe('Helpful context')
    })

    it('should persist the request and make it visible via GET', async () => {
      await POST(makeRequest({
        method: 'POST',
        apiKey: writeKey,
        body: { title: 'Visible after creation' },
      }))
      const listRes = await GET(makeRequest({ apiKey: readKey }))
      const body = await listRes.json()
      expect(body.data.some((r: { title: string }) => r.title === 'Visible after creation')).toBe(true)
    })
  })
})
