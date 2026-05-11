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

const streamTextSpy = vi.fn()
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: (args: unknown) => {
      streamTextSpy(args)
      return {
        toUIMessageStreamResponse: () =>
          new Response('stream-ok', { status: 200 }),
      }
    },
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (model: string) => ({ id: `anthropic:${model}`, modelId: model }),
}))

function makePost(
  requestId: string,
  body: unknown,
  opts: { invalidJson?: boolean } = {},
): { req: Request; ctx: { params: Promise<{ requestId: string }> } } {
  const req = new Request(`http://localhost/api/agents/assess/${requestId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: opts.invalidJson ? '{not json' : JSON.stringify(body),
  })
  return { req, ctx: { params: Promise.resolve({ requestId }) } }
}

async function markIntakeComplete(id: string): Promise<void> {
  const { query } = await import('@/lib/db/pool')
  await query(
    `UPDATE feature_requests SET intake_complete = true,
       intake_data = '{"problem": "test"}'::jsonb WHERE id = $1`,
    [id],
  )
}

describe.skipIf(!hasDb())('/api/agents/assess/[requestId]', () => {
  let org: TestOrg
  let user: TestUser
  let otherOrg: TestOrg
  let otherUser: TestUser
  let request: TestRequest // intake completed
  let pendingRequest: TestRequest // intake not yet complete
  let crossOrgRequest: TestRequest
  let POST: typeof import('./route').POST

  beforeAll(async () => {
    org = await createTestOrg('assess-route-test')
    user = await createTestUser(org)
    otherOrg = await createTestOrg('assess-other-org')
    otherUser = await createTestUser(otherOrg)
    request = await createTestRequest(org, user)
    await markIntakeComplete(request.id)
    pendingRequest = await createTestRequest(org, user)
    crossOrgRequest = await createTestRequest(otherOrg, otherUser)
    await markIntakeComplete(crossOrgRequest.id)
    POST = (await import('./route')).POST
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id])
    await cleanupTestOrg(otherOrg, [otherUser.id])
  })

  beforeEach(() => {
    streamTextSpy.mockReset()
    fakeSession = { user: { id: user.id, orgId: org.id } }
  })

  describe('authentication', () => {
    it('should return 401 when there is no session', async () => {
      fakeSession = null
      const { req, ctx } = makePost(request.id, { messages: [] })
      const res = await POST(req, ctx)
      expect(res.status).toBe(401)
    })

    it('should return 401 when the session has no orgId', async () => {
      fakeSession = { user: { id: user.id } }
      const { req, ctx } = makePost(request.id, { messages: [] })
      const res = await POST(req, ctx)
      expect(res.status).toBe(401)
    })
  })

  describe('validation', () => {
    it('should return 400 for invalid JSON', async () => {
      const { req, ctx } = makePost(request.id, null, { invalidJson: true })
      const res = await POST(req, ctx)
      expect(res.status).toBe(400)
    })

    it('should return 400 when messages is not an array', async () => {
      const { req, ctx } = makePost(request.id, { messages: 'oops' })
      const res = await POST(req, ctx)
      expect(res.status).toBe(400)
    })
  })

  describe('authorization and lookup', () => {
    it('should return 404 when the request does not exist', async () => {
      const { req, ctx } = makePost('00000000-0000-0000-0000-000000000000', { messages: [] })
      const res = await POST(req, ctx)
      expect(res.status).toBe(404)
    })

    it('should return 403 when the request belongs to another org', async () => {
      const { req, ctx } = makePost(crossOrgRequest.id, { messages: [] })
      const res = await POST(req, ctx)
      expect(res.status).toBe(403)
      expect(streamTextSpy).not.toHaveBeenCalled()
    })

    it('should return 400 when intake is not yet complete', async () => {
      const { req, ctx } = makePost(pendingRequest.id, { messages: [] })
      const res = await POST(req, ctx)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/intake/i)
      expect(streamTextSpy).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('should call streamText with Anthropic + assessment prompt including intake data', async () => {
      const { req, ctx } = makePost(request.id, {
        messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Begin assessment' }] }],
      })
      const res = await POST(req, ctx)
      expect(res.status).toBe(200)
      expect(streamTextSpy).toHaveBeenCalledTimes(1)
      const args = streamTextSpy.mock.calls[0][0] as {
        model: { modelId: string }
        system: string
        tools: Record<string, unknown>
      }
      expect(args.model.modelId).toMatch(/^claude-/)
      // System prompt is composed from the assessment template + intake data context.
      expect(args.system).toContain('Test feature request') // default title from helper
      expect(args.system).toContain('"problem": "test"') // intake data injected
      expect(Object.keys(args.tools).length).toBeGreaterThan(0)
    })
  })
})
