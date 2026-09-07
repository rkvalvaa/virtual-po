import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import { POST } from './route'

const SECRET = 'slack-commands-signing-secret'
const TEAM_ID = 'T12345'
const ORG_ID = '22222222-2222-2222-2222-222222222222'
const USER_ID = '33333333-3333-3333-3333-333333333333'
const REQUEST_ID = '11111111-1111-1111-1111-111111111111'

process.env.SLACK_SIGNING_SECRET = SECRET
process.env.NEXT_PUBLIC_APP_URL = 'https://vpo.example.com'

// --- Mocked boundaries: Slack Web API + every DB query the route touches ---

type FakeIntegration = { id: string; organizationId: string; config: Record<string, unknown> } | null
let fakeIntegrationByTeam: FakeIntegration = null
let fakeIntegrationByType: FakeIntegration = null
let fakeEmail: string | null = null
let fakeUser: { id: string; email: string } | null = null
let fakeRequest: { id: string; title: string; status: string; organizationId: string } | null = null

const createFeatureRequestMock = vi.fn(
  (orgId: string, requesterId: string, title: string) =>
    Promise.resolve({ id: REQUEST_ID, title, status: 'DRAFT', organizationId: orgId, requesterId })
)
const listFeatureRequestsMock = vi.fn(() =>
  Promise.resolve({
    requests: [
      { id: 'r1', title: 'First request', status: 'DRAFT' },
      { id: 'r2', title: 'Second request', status: 'UNDER_REVIEW' },
    ],
    total: 2,
  })
)
const getFeatureRequestByIdMock = vi.fn(() => Promise.resolve(fakeRequest))
const logActivityMock = vi.fn((..._args: unknown[]) => Promise.resolve())

vi.mock('@/lib/db/queries/feature-requests', () => ({
  createFeatureRequest: (...args: [string, string, string]) => createFeatureRequestMock(...args),
  listFeatureRequests: () => listFeatureRequestsMock(),
  getFeatureRequestById: () => getFeatureRequestByIdMock(),
}))

vi.mock('@/lib/db/queries/activity-log', () => ({
  logActivity: (...args: unknown[]) => logActivityMock(...args),
}))

vi.mock('@/lib/db/queries/jira-sync', () => ({
  getIntegrationBySlackTeamId: vi.fn(() => Promise.resolve(fakeIntegrationByTeam)),
  getIntegrationByType: vi.fn(() => Promise.resolve(fakeIntegrationByType)),
}))

vi.mock('@/lib/db/queries/users', () => ({
  getUserByEmail: vi.fn(() => Promise.resolve(fakeUser)),
}))

vi.mock('@/lib/db/queries/organizations', () => ({
  getOrganizationRole: vi.fn(() => Promise.resolve('STAKEHOLDER')),
}))

vi.mock('@/lib/slack/client', () => ({
  getSlackClientFromIntegration: () => ({
    getUserEmail: () => Promise.resolve(fakeEmail),
  }),
}))

// --- Helpers -------------------------------------------------------------

function buildBody(text: string): string {
  return new URLSearchParams({
    team_id: TEAM_ID,
    user_id: 'U123',
    text,
  }).toString()
}

function makePost(body: string, opts: { badSignature?: boolean } = {}): NextRequest {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const hmac = crypto
    .createHmac('sha256', opts.badSignature ? 'wrong-secret' : SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')

  return new NextRequest('http://localhost/api/slack/commands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': `v0=${hmac}`,
    },
    body,
  })
}

describe('/api/slack/commands', () => {
  beforeEach(() => {
    createFeatureRequestMock.mockClear()
    listFeatureRequestsMock.mockClear()
    getFeatureRequestByIdMock.mockClear()
    logActivityMock.mockClear()
    fakeIntegrationByTeam = { id: 'int-1', organizationId: ORG_ID, config: { botToken: 'xoxb-test', teamId: TEAM_ID } }
    fakeIntegrationByType = fakeIntegrationByTeam
    fakeEmail = 'stakeholder@example.com'
    fakeUser = { id: USER_ID, email: 'stakeholder@example.com' }
    fakeRequest = null
  })

  it('should reject a request whose signature does not verify', async () => {
    const res = await POST(makePost(buildBody('submit New idea'), { badSignature: true }))

    expect(res.status).toBe(401)
    expect(createFeatureRequestMock).not.toHaveBeenCalled()
  })

  it('should create a DRAFT request for the resolved user/org and reply with a link', async () => {
    const res = await POST(makePost(buildBody('submit Add dark mode')))
    const json = await res.json()

    expect(createFeatureRequestMock).toHaveBeenCalledWith(ORG_ID, USER_ID, 'Add dark mode')
    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain(`https://vpo.example.com/requests/${REQUEST_ID}`)
  })

  it('should reply with a usage hint when submit has no title', async () => {
    const json = await (await POST(makePost(buildBody('submit')))).json()

    expect(createFeatureRequestMock).not.toHaveBeenCalled()
    expect(json.text).toContain('Usage')
  })

  it('should list the caller\'s recent requests', async () => {
    const json = await (await POST(makePost(buildBody('list')))).json()

    expect(listFeatureRequestsMock).toHaveBeenCalled()
    expect(json.text).toContain('First request')
    expect(json.text).toContain('Second request')
  })

  it('should reply with an error for an unknown request id', async () => {
    fakeRequest = null

    const json = await (await POST(makePost(buildBody('status 99999999-9999-9999-9999-999999999999')))).json()

    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('No request found')
  })

  it('should reply with the request status when found and org-scoped', async () => {
    fakeRequest = { id: REQUEST_ID, title: 'Existing', status: 'UNDER_REVIEW', organizationId: ORG_ID }

    const json = await (await POST(makePost(buildBody(`status ${REQUEST_ID}`)))).json()

    expect(json.text).toContain('Existing')
    expect(json.text).toContain('UNDER_REVIEW')
  })

  it('should reply with an error when the Slack user cannot be resolved to a VPO account', async () => {
    fakeUser = null

    const json = await (await POST(makePost(buildBody('submit Add dark mode')))).json()

    expect(createFeatureRequestMock).not.toHaveBeenCalled()
    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('No VPO account')
  })

  it('should reply with an error when no Slack integration is connected for the team', async () => {
    fakeIntegrationByTeam = null

    const json = await (await POST(makePost(buildBody('submit Add dark mode')))).json()

    expect(createFeatureRequestMock).not.toHaveBeenCalled()
    expect(json.response_type).toBe('ephemeral')
    expect(json.text).toContain('not connected')
  })

  it('should show usage text for help or an unrecognized subcommand', async () => {
    const json = await (await POST(makePost(buildBody('nonsense')))).json()

    expect(json.text).toContain('Virtual Product Owner Commands')
  })
})
