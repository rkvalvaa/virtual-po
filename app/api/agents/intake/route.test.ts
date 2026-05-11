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

// Capture what streamText was called with so we can verify the model,
// system prompt, and tool wiring without invoking the real LLM.
const streamTextSpy = vi.fn()
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: (args: unknown) => {
      streamTextSpy(args)
      return {
        toUIMessageStreamResponse: () =>
          new Response('stream-ok', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }),
      }
    },
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (model: string) => ({ id: `anthropic:${model}`, modelId: model }),
}))

function makePost(body: unknown, opts: { invalidJson?: boolean } = {}): Request {
  return new Request('http://localhost/api/agents/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: opts.invalidJson ? '{not json' : JSON.stringify(body),
  })
}

describe.skipIf(!hasDb())('/api/agents/intake', () => {
  let org: TestOrg
  let user: TestUser
  let otherOrg: TestOrg
  let otherUser: TestUser
  let request: TestRequest
  let crossOrgRequest: TestRequest
  let POST: typeof import('./route').POST

  beforeAll(async () => {
    org = await createTestOrg('intake-route-test')
    user = await createTestUser(org)
    otherOrg = await createTestOrg('intake-other-org')
    otherUser = await createTestUser(otherOrg)
    request = await createTestRequest(org, user)
    crossOrgRequest = await createTestRequest(otherOrg, otherUser)
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
      const res = await POST(makePost({ messages: [], requestId: request.id }))
      expect(res.status).toBe(401)
      expect(streamTextSpy).not.toHaveBeenCalled()
    })

    it('should return 401 when the session has no orgId', async () => {
      fakeSession = { user: { id: user.id } }
      const res = await POST(makePost({ messages: [], requestId: request.id }))
      expect(res.status).toBe(401)
    })

    it('should return 401 when the session has no user.id', async () => {
      fakeSession = { user: { orgId: org.id } }
      const res = await POST(makePost({ messages: [], requestId: request.id }))
      expect(res.status).toBe(401)
    })
  })

  describe('validation', () => {
    it('should return 400 for invalid JSON', async () => {
      const res = await POST(makePost(null, { invalidJson: true }))
      expect(res.status).toBe(400)
    })

    it('should return 400 when requestId is missing', async () => {
      const res = await POST(makePost({ messages: [] }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/requestid/i)
    })

    it('should return 400 when messages is not an array', async () => {
      const res = await POST(makePost({ messages: 'hello', requestId: request.id }))
      expect(res.status).toBe(400)
    })
  })

  describe('authorization and lookup', () => {
    it('should return 404 when the request does not exist', async () => {
      const res = await POST(makePost({
        messages: [],
        requestId: '00000000-0000-0000-0000-000000000000',
      }))
      expect(res.status).toBe(404)
    })

    it('should return 403 when the request belongs to another org', async () => {
      const res = await POST(makePost({
        messages: [],
        requestId: crossOrgRequest.id,
      }))
      expect(res.status).toBe(403)
      expect(streamTextSpy).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('should call streamText with the Anthropic model and intake system prompt', async () => {
      const res = await POST(makePost({
        messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
        requestId: request.id,
      }))
      expect(res.status).toBe(200)
      expect(streamTextSpy).toHaveBeenCalledTimes(1)
      const args = streamTextSpy.mock.calls[0][0] as {
        model: { modelId: string }
        system: string
        tools: Record<string, unknown>
      }
      // Model is an Anthropic Claude model
      expect(args.model.modelId).toMatch(/^claude-/)
      // System prompt includes the request id for context
      expect(args.system).toContain(request.id)
      // Tools object is non-empty (intake tools wired up)
      expect(Object.keys(args.tools).length).toBeGreaterThan(0)
    })

    it('should return a streaming response from toUIMessageStreamResponse', async () => {
      const res = await POST(makePost({
        messages: [],
        requestId: request.id,
      }))
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toBe('stream-ok')
    })
  })
})
