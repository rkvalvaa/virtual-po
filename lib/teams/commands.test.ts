// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { executeTeamsCommand, resolveTeamsActor } from './commands'

describe.skipIf(!hasDb())('Teams identity and commands', () => {
  let org: TestOrg, user: TestUser
  beforeAll(async () => {
    vi.stubEnv('APP_URL', 'https://vpo.example.test'); vi.stubEnv('TEAMS_NOTIFICATIONS_VALIDATED', 'true')
    org = await createTestOrg('teams-commands'); user = await createTestUser(org, 'STAKEHOLDER')
    await query(`INSERT INTO integrations(organization_id,type,name,config) VALUES($1,'TEAMS','Teams','{}')`, [org.id])
    await query('INSERT INTO teams_tenants(organization_id,tenant_id) VALUES($1,$2)', [org.id, 'tenant-stable'])
    await query('INSERT INTO teams_identity_bindings(organization_id,tenant_id,teams_user_id,user_id) VALUES($1,$2,$3,$4)', [org.id, 'tenant-stable', 'teams-user-stable', user.id])
    await query(`INSERT INTO teams_notifications(organization_id,channel_name,webhook_url,event_type)
      VALUES($1,'Product','https://tenant.webhook.office.com/path','REQUEST_CREATED')`, [org.id])
  })
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); vi.unstubAllEnvs() })

  it('resolves opaque provider IDs through a current membership and deduplicates creates', async () => {
    const actor = await resolveTeamsActor('tenant-stable', 'teams-user-stable')
    expect(actor).toMatchObject({ organizationId: org.id, userId: user.id })
    const input = { activityId: 'activity-dedup', tenantId: 'tenant-stable', conversationId: 'conversation-stable', teamsUserId: 'teams-user-stable', actor: actor!, text: 'vpo create Exact Mixed Case Title' }
    const [first, second] = await Promise.all([executeTeamsCommand(input), executeTeamsCommand(input)])
    expect(second).toEqual(first)
    expect((await query('SELECT count(*)::int AS count FROM feature_requests WHERE id=$1 AND organization_id=$2', [first.requestId, org.id])).rows[0].count).toBe(1)
    expect((await query(`SELECT count(*)::int AS count FROM activity_log WHERE request_id=$1 AND action='REQUEST_CREATED'`, [first.requestId])).rows[0].count).toBe(1)
    expect((await query(`SELECT count(*)::int AS count FROM teams_deliveries WHERE request_id=$1 AND event_type='REQUEST_CREATED'`, [first.requestId])).rows[0].count).toBe(1)
    await expect(executeTeamsCommand({ ...input, text: 'vpo create Changed Replay' })).rejects.toThrow(/replay/)
  })

  it('stops resolving a binding as soon as membership is revoked', async () => {
    const actor = await resolveTeamsActor('tenant-stable', 'teams-user-stable')
    const replay = { activityId: 'activity-before-revoke', tenantId: 'tenant-stable', conversationId: 'conversation-stable', teamsUserId: 'teams-user-stable', actor: actor!, text: 'vpo help' }
    await executeTeamsCommand(replay)
    await query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [org.id, user.id])
    expect(await resolveTeamsActor('tenant-stable', 'teams-user-stable')).toBeNull()
    await expect(executeTeamsCommand(replay)).rejects.toThrow(/revoked/)
  })
})
