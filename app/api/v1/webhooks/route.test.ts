import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { GET, POST } from './route'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestApiKey,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

function makeRequest(
  options: {
    method?: 'GET' | 'POST'
    apiKey?: string
    body?: unknown
  } = {},
): Request {
  const headers: Record<string, string> = {}
  if (options.apiKey) headers['Authorization'] = `Bearer ${options.apiKey}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  return new Request('http://localhost/api/v1/webhooks', {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
}

describe.skipIf(!hasDb())('/api/v1/webhooks', () => {
  let org: TestOrg
  let creator: TestUser
  let readKey: string
  let writeKey: string
  let adminKey: string

  beforeAll(async () => {
    org = await createTestOrg('v1-webhooks-test')
    creator = await createTestUser(org, 'ADMIN')
    readKey = (await createTestApiKey(org, ['read'], creator.id)).key
    writeKey = (await createTestApiKey(org, ['write'], creator.id)).key
    adminKey = (await createTestApiKey(org, ['admin'], creator.id)).key
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [creator.id])
  })

  beforeEach(async () => {
    const { query } = await import('@/lib/db/pool')
    await query(`DELETE FROM webhook_subscriptions WHERE organization_id = $1`, [org.id])
  })

  describe('GET', () => {
    it('should return 401 with no key', async () => {
      const res = await GET(makeRequest())
      expect(res.status).toBe(401)
    })

    it('should return 200 with a read key', async () => {
      const res = await GET(makeRequest({ apiKey: readKey }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toEqual([])
    })

    it('should return webhook subscriptions for the org', async () => {
      const { createWebhookSubscription } = await import('@/lib/db/queries/webhooks')
      await createWebhookSubscription(org.id, 'https://example.test/hook', 'secret123', ['request.created'])

      const res = await GET(makeRequest({ apiKey: readKey }))
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].url).toBe('https://example.test/hook')
    })

    it('should strip the secret field from the response', async () => {
      const { createWebhookSubscription } = await import('@/lib/db/queries/webhooks')
      await createWebhookSubscription(org.id, 'https://example.test/hook', 'super-secret-value', ['request.created'])

      const res = await GET(makeRequest({ apiKey: readKey }))
      const body = await res.json()
      expect(body.data[0]).not.toHaveProperty('secret')
      expect(JSON.stringify(body)).not.toContain('super-secret-value')
    })
  })

  describe('POST — authorization', () => {
    it('should return 401 with no key', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        body: { url: 'https://example.test/hook', events: ['request.created'] },
      }))
      expect(res.status).toBe(401)
    })

    it('should return 403 with a write-only key (admin required)', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: writeKey,
        body: { url: 'https://example.test/hook', events: ['request.created'] },
      }))
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('FORBIDDEN')
    })

    it('should return 403 with a read-only key', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: readKey,
        body: { url: 'https://example.test/hook', events: ['request.created'] },
      }))
      expect(res.status).toBe(403)
    })
  })

  describe('POST — validation', () => {
    it('should return 400 for invalid JSON body', async () => {
      const req = new Request('http://localhost/api/v1/webhooks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: '{not json',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('INVALID_BODY')
    })

    it('should return 400 when url is missing', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: adminKey,
        body: { events: ['request.created'] },
      }))
      expect(res.status).toBe(400)
    })

    it('should return 400 when events is missing or empty', async () => {
      const missing = await POST(makeRequest({
        method: 'POST',
        apiKey: adminKey,
        body: { url: 'https://example.test/hook' },
      }))
      expect(missing.status).toBe(400)

      const empty = await POST(makeRequest({
        method: 'POST',
        apiKey: adminKey,
        body: { url: 'https://example.test/hook', events: [] },
      }))
      expect(empty.status).toBe(400)
    })

    it('should return 400 for an unknown event name', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: adminKey,
        body: { url: 'https://example.test/hook', events: ['request.created', 'totally.fake'] },
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/totally\.fake/)
    })
  })

  describe('POST — creation', () => {
    it('should create a webhook and return 201 with the new record', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: adminKey,
        body: {
          url: 'https://example.test/hook',
          events: ['request.created', 'decision.made'],
          secret: 'my-secret',
        },
      }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.url).toBe('https://example.test/hook')
      expect(body.data.events).toEqual(['request.created', 'decision.made'])
      expect(body.data.organizationId).toBe(org.id)
      expect(body.data.isActive).toBe(true)
    })

    it('should generate a random secret when not provided', async () => {
      const res = await POST(makeRequest({
        method: 'POST',
        apiKey: adminKey,
        body: {
          url: 'https://example.test/hook',
          events: ['request.created'],
        },
      }))
      expect(res.status).toBe(201)
      const body = await res.json()
      // The secret IS in the create response (only GET strips it), and it
      // should be a 64-char hex string from randomBytes(32).
      expect(body.data.secret).toMatch(/^[0-9a-f]{64}$/)
    })
  })
})
