import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PATCH, DELETE } from './route'
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
  webhookId: string,
  options: {
    method?: 'PATCH' | 'DELETE'
    apiKey?: string
    body?: unknown
  } = {},
): { req: Request; ctx: { params: Promise<{ id: string }> } } {
  const headers: Record<string, string> = {}
  if (options.apiKey) headers['Authorization'] = `Bearer ${options.apiKey}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const req = new Request(`http://localhost/api/v1/webhooks/${webhookId}`, {
    method: options.method ?? 'PATCH',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  return { req, ctx: { params: Promise.resolve({ id: webhookId }) } }
}

describe.skipIf(!hasDb())('/api/v1/webhooks/[id]', () => {
  let org: TestOrg
  let creator: TestUser
  let readKey: string
  let adminKey: string

  beforeAll(async () => {
    org = await createTestOrg('v1-webhook-id-test')
    creator = await createTestUser(org, 'ADMIN')
    readKey = (await createTestApiKey(org, ['read'], creator.id)).key
    adminKey = (await createTestApiKey(org, ['admin'], creator.id)).key
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [creator.id])
  })

  beforeEach(async () => {
    const { query } = await import('@/lib/db/pool')
    await query(`DELETE FROM webhook_subscriptions WHERE organization_id = $1`, [org.id])
  })

  async function createHook(): Promise<{ id: string }> {
    const { createWebhookSubscription } = await import('@/lib/db/queries/webhooks')
    const hook = await createWebhookSubscription(
      org.id,
      'https://example.test/hook',
      'initial-secret',
      ['request.created'],
    )
    return { id: hook.id }
  }

  describe('PATCH', () => {
    it('should return 401 with no API key', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, { body: { url: 'https://updated.test/x' } })
      const res = await PATCH(req, ctx)
      expect(res.status).toBe(401)
    })

    it('should return 403 with a read-only key (admin required)', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, {
        apiKey: readKey,
        body: { url: 'https://updated.test/x' },
      })
      const res = await PATCH(req, ctx)
      expect(res.status).toBe(403)
    })

    it('should return 404 for an id that does not exist in the org', async () => {
      const { req, ctx } = makeRequest('00000000-0000-0000-0000-000000000000', {
        apiKey: adminKey,
        body: { url: 'https://updated.test/x' },
      })
      const res = await PATCH(req, ctx)
      expect(res.status).toBe(404)
    })

    it('should return 404 for a webhook owned by another org', async () => {
      const otherOrg = await createTestOrg('v1-webhook-id-isolation')
      try {
        const { createWebhookSubscription } = await import('@/lib/db/queries/webhooks')
        const theirHook = await createWebhookSubscription(
          otherOrg.id,
          'https://other.test/hook',
          's',
          ['request.created'],
        )
        const { req, ctx } = makeRequest(theirHook.id, {
          apiKey: adminKey,
          body: { url: 'https://updated.test/x' },
        })
        const res = await PATCH(req, ctx)
        expect(res.status).toBe(404)
      } finally {
        await cleanupTestOrg(otherOrg)
      }
    })

    it('should return 400 for invalid JSON', async () => {
      const hook = await createHook()
      const req = new Request(`http://localhost/api/v1/webhooks/${hook.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
        body: '{not json',
      })
      const res = await PATCH(req, { params: Promise.resolve({ id: hook.id }) })
      expect(res.status).toBe(400)
    })

    it('should return 400 when url is provided but empty/whitespace', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, {
        apiKey: adminKey,
        body: { url: '   ' },
      })
      const res = await PATCH(req, ctx)
      expect(res.status).toBe(400)
    })

    it('should return 400 for an unknown event name', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, {
        apiKey: adminKey,
        body: { events: ['totally.fake'] },
      })
      const res = await PATCH(req, ctx)
      expect(res.status).toBe(400)
    })

    it('should return 400 when isActive is not a boolean', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, {
        apiKey: adminKey,
        body: { isActive: 'yes' },
      })
      const res = await PATCH(req, ctx)
      expect(res.status).toBe(400)
    })

    it('should update url and return 200 with the updated record (no secret)', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, {
        apiKey: adminKey,
        body: { url: 'https://updated.test/x' },
      })
      const res = await PATCH(req, ctx)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.url).toBe('https://updated.test/x')
      expect(body.data).not.toHaveProperty('secret')
    })

    it('should update events and isActive together', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, {
        apiKey: adminKey,
        body: { events: ['decision.made'], isActive: false },
      })
      const res = await PATCH(req, ctx)
      const body = await res.json()
      expect(body.data.events).toEqual(['decision.made'])
      expect(body.data.isActive).toBe(false)
    })
  })

  describe('DELETE', () => {
    it('should return 401 with no API key', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, { method: 'DELETE' })
      const res = await DELETE(req, ctx)
      expect(res.status).toBe(401)
    })

    it('should return 403 with a read-only key', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, { method: 'DELETE', apiKey: readKey })
      const res = await DELETE(req, ctx)
      expect(res.status).toBe(403)
    })

    it('should return 404 for an id that does not exist in the org', async () => {
      const { req, ctx } = makeRequest('00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
        apiKey: adminKey,
      })
      const res = await DELETE(req, ctx)
      expect(res.status).toBe(404)
    })

    it('should return 200 and remove the webhook', async () => {
      const hook = await createHook()
      const { req, ctx } = makeRequest(hook.id, { method: 'DELETE', apiKey: adminKey })
      const res = await DELETE(req, ctx)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.deleted).toBe(true)

      const { getWebhooksByOrg } = await import('@/lib/db/queries/webhooks')
      const remaining = await getWebhooksByOrg(org.id)
      expect(remaining.find((w) => w.id === hook.id)).toBeUndefined()
    })
  })
})
