import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import type { UserRole } from '@/lib/types/database'
import { POST } from './route'

const SECRET = 'slack-interactions-signing-secret'
const REQUEST_ID = '11111111-1111-1111-1111-111111111111'
const ORG_ID = '22222222-2222-2222-2222-222222222222'
const USER_ID = '33333333-3333-3333-3333-333333333333'

process.env.SLACK_SIGNING_SECRET = SECRET

// --- Mocked boundaries: Slack Web API + every DB query the route touches ---

type FakeRequest = { id: string; organizationId: string; status: string } | null
let fakeRequest: FakeRequest = null
let fakeEmail: string | null = null
let fakeUser: { id: string; email: string } | null = null
let fakeRole: UserRole | null = null
let fakeIntegration: { id: string; config: Record<string, unknown> } | null = null

vi.mock('@/lib/db/queries/feature-requests', () => ({
  getFeatureRequestById: vi.fn(() => Promise.resolve(fakeRequest)),
}))

vi.mock('@/lib/db/queries/jira-sync', () => ({
  getIntegrationByType: vi.fn(() => Promise.resolve(fakeIntegration)),
}))

vi.mock('@/lib/db/queries/users', () => ({
  getUserByEmail: vi.fn(() => Promise.resolve(fakeUser)),
}))

vi.mock('@/lib/db/queries/organizations', () => ({
  getOrganizationRole: vi.fn(() => Promise.resolve(fakeRole)),
}))

vi.mock('@/lib/slack/client', () => ({
  getSlackClientFromIntegration: () => ({
    getUserEmail: () => Promise.resolve(fakeEmail),
  }),
}))

const applyDecisionMock = vi.fn<(params: unknown) => Promise<void>>(() =>
  Promise.resolve()
)
vi.mock('@/lib/decisions/apply', () => ({
  applyDecision: (params: unknown) => applyDecisionMock(params),
}))

// --- Helpers -------------------------------------------------------------

function buildBody(actionId: string, value: string | undefined = REQUEST_ID): string {
  const payload = {
    type: 'block_actions',
    user: { id: 'U123', username: 'reviewer.rita' },
    actions: [{ action_id: actionId, value }],
  }
  return new URLSearchParams({ payload: JSON.stringify(payload) }).toString()
}

function makePost(body: string, opts: { badSignature?: boolean } = {}): NextRequest {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const hmac = crypto
    .createHmac('sha256', opts.badSignature ? 'wrong-secret' : SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')

  return new NextRequest('http://localhost/api/slack/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': `v0=${hmac}`,
    },
    body,
  })
}

describe('/api/slack/interactions', () => {
  beforeEach(() => {
    applyDecisionMock.mockClear()
    fakeRequest = { id: REQUEST_ID, organizationId: ORG_ID, status: 'UNDER_REVIEW' }
    fakeIntegration = { id: 'int-1', config: { botToken: 'xoxb-test' } }
    fakeEmail = 'rita@example.com'
    fakeUser = { id: USER_ID, email: 'rita@example.com' }
    fakeRole = 'REVIEWER'
  })

  it('should reject a request whose signature does not verify', async () => {
    const body = buildBody('approve_request')
    const res = await POST(makePost(body, { badSignature: true }))

    expect(res.status).toBe(401)
    expect(applyDecisionMock).not.toHaveBeenCalled()
  })

  it('should record an APPROVE decision and replace the original message', async () => {
    const res = await POST(makePost(buildBody('approve_request')))

    expect(applyDecisionMock).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
      decision: 'APPROVE',
      rationale: 'Approved from Slack by @reviewer.rita',
    })

    const json = await res.json()
    expect(json.replace_original).toBe(true)
    expect(json.text).toContain('approved by <@U123>')
  })

  it('should record a REJECT decision and replace the original message', async () => {
    const res = await POST(makePost(buildBody('reject_request')))

    expect(applyDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID, decision: 'REJECT' })
    )

    const json = await res.json()
    expect(json.replace_original).toBe(true)
    expect(json.text).toContain('rejected by <@U123>')
  })

  it('should reply ephemerally and not mutate when the user lacks REVIEWER role', async () => {
    fakeRole = 'STAKEHOLDER'

    const json = await (await POST(makePost(buildBody('approve_request')))).json()

    expect(applyDecisionMock).not.toHaveBeenCalled()
    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('REVIEWER role')
  })

  it('should reply ephemerally and not mutate when the Slack user has no VPO account', async () => {
    fakeUser = null

    const json = await (await POST(makePost(buildBody('approve_request')))).json()

    expect(applyDecisionMock).not.toHaveBeenCalled()
    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('No VPO account')
  })

  it('should reply ephemerally and not mutate for an unknown request id', async () => {
    fakeRequest = null

    const json = await (
      await POST(makePost(buildBody('approve_request', '99999999-9999-9999-9999-999999999999')))
    ).json()

    expect(applyDecisionMock).not.toHaveBeenCalled()
    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('no longer exists')
  })

  it('should surface an illegal transition as an ephemeral error', async () => {
    applyDecisionMock.mockRejectedValueOnce(
      new Error('Cannot transition from APPROVED to APPROVED')
    )

    const json = await (await POST(makePost(buildBody('approve_request')))).json()

    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('Cannot transition')
  })

  it('should ignore action ids it does not handle', async () => {
    const json = await (await POST(makePost(buildBody('view_request')))).json()

    expect(applyDecisionMock).not.toHaveBeenCalled()
    expect(json).toEqual({ ok: true })
  })
})
