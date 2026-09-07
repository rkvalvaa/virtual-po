import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveSlackUser } from './resolve-user'

const ORG_ID = '22222222-2222-2222-2222-222222222222'
const USER_ID = '33333333-3333-3333-3333-333333333333'
const SLACK_USER_ID = 'U123'

type FakeIntegration = { id: string; organizationId: string; config: Record<string, unknown> } | null
let fakeIntegration: FakeIntegration = null
let fakeEmail: string | null = null
let fakeUser: { id: string; email: string } | null = null
let fakeRole: 'STAKEHOLDER' | 'REVIEWER' | 'ADMIN' | null = null

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

describe('resolveSlackUser', () => {
  beforeEach(() => {
    fakeIntegration = { id: 'int-1', organizationId: ORG_ID, config: { botToken: 'xoxb-test' } }
    fakeEmail = 'rita@example.com'
    fakeUser = { id: USER_ID, email: 'rita@example.com' }
    fakeRole = 'REVIEWER'
  })

  it('resolves a Slack user to their VPO user and org role', async () => {
    const result = await resolveSlackUser(ORG_ID, SLACK_USER_ID)

    expect(result).toEqual({
      ok: true,
      integration: fakeIntegration,
      user: fakeUser,
      role: 'REVIEWER',
    })
  })

  it('fails with no_integration when the org has no active Slack integration', async () => {
    fakeIntegration = null

    const result = await resolveSlackUser(ORG_ID, SLACK_USER_ID)

    expect(result).toEqual({ ok: false, reason: 'no_integration' })
  })

  it('fails with no_account when the Slack profile has no email', async () => {
    fakeEmail = null

    const result = await resolveSlackUser(ORG_ID, SLACK_USER_ID)

    expect(result).toEqual({ ok: false, reason: 'no_account' })
  })

  it('fails with no_account when no VPO user matches the email', async () => {
    fakeUser = null

    const result = await resolveSlackUser(ORG_ID, SLACK_USER_ID)

    expect(result).toEqual({ ok: false, reason: 'no_account' })
  })
})
