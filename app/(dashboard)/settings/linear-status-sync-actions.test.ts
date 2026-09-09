// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { upsertIntegration } from '@/lib/db/queries/jira-sync'
import { getLinearStatusSyncOverview, loadLinearStatusWorkflowStates, saveLinearStatusSync } from './linear-actions'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'ADMIN' }))
const linear = vi.hoisted(() => ({ getTeams: vi.fn(), getWorkflowStates: vi.fn(), getIssue: vi.fn(), listUpdatedIssuesPage: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/linear/client', async importOriginal => ({ ...(await importOriginal<object>()), getLinearClientFromIntegration: () => linear }))

describe.skipIf(!hasDb())('Linear status sync settings actions', () => {
  let org: TestOrg
  let user: TestUser
  beforeAll(async () => {
    org = await createTestOrg('linear-status-actions')
    user = await createTestUser(org, 'ADMIN')
    Object.assign(actor, { id: user.id, orgId: org.id, role: 'ADMIN' })
    await upsertIntegration(org.id, 'LINEAR', 'Linear', { apiKey: 'test', defaultTeamId: 'team-1' })
  })
  afterAll(async () => cleanupTestOrg(org, [user.id]))
  beforeEach(() => {
    actor.role = 'ADMIN'
    linear.getTeams.mockResolvedValue([{ id: 'team-1', name: 'Engineering', key: 'ENG' }])
    linear.getWorkflowStates.mockResolvedValue([{ id: 'started', name: 'Started', type: 'started' }])
  })

  it('lets an admin save only server-verified Linear status IDs', async () => {
    expect(await loadLinearStatusWorkflowStates('team-1')).toMatchObject({ success: true, states: [{ id: 'started' }] })
    expect(await saveLinearStatusSync({ destination: 'team-1', enabled: true, mappings: [{ remoteStatusId: 'started', remoteStatusName: 'spoofed', targetStatus: 'IN_PROGRESS' }] })).toEqual({ success: true })
    const result = await getLinearStatusSyncOverview('team-1')
    expect(result).toMatchObject({ success: true, overview: { config: { enabled: true, mappings: [{ remoteStatusId: 'started', remoteStatusName: 'Started', targetStatus: 'IN_PROGRESS' }] } } })
    expect(await saveLinearStatusSync({ destination: 'team-1', enabled: true, mappings: [{ remoteStatusId: 'foreign', remoteStatusName: 'Foreign', targetStatus: 'IN_PROGRESS' }] })).toMatchObject({ success: false })
  })

  it('rejects non-admin configuration before provider access', async () => {
    actor.role = 'REVIEWER'
    linear.getTeams.mockClear()
    expect(await saveLinearStatusSync({ destination: 'team-1', enabled: true, mappings: [] })).toEqual({ success: false, error: 'Only admins can configure Linear status sync.' })
    expect(linear.getTeams).not.toHaveBeenCalled()
  })
})
