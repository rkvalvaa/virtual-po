// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestChangeRequest, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { transitionWorkflow } from './transition'

describe.skipIf(!hasDb())('transitionWorkflow', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let admin: TestUser
  let reviewer: TestUser
  let requester: TestUser
  let outsider: TestUser

  beforeAll(async () => {
    org = await createTestOrg('change-workflow')
    otherOrg = await createTestOrg('change-workflow-other')
    admin = await createTestUser(org, 'ADMIN')
    reviewer = await createTestUser(org, 'REVIEWER')
    requester = await createTestUser(org, 'STAKEHOLDER')
    outsider = await createTestUser(otherOrg, 'ADMIN')
  })
  afterAll(async () => {
    await cleanupTestOrg(org, [admin.id, reviewer.id, requester.id])
    await cleanupTestOrg(otherOrg, [outsider.id])
  })

  const row = async (id: string) => (await query('SELECT workflow_state, workflow_version, workflow_data FROM feature_requests WHERE id = $1', [id])).rows[0]
  /** Moves from the state the caller last saw: the current one unless the test says otherwise. */
  const move = async (requestId: string, user: TestUser, to: string, extra: { fields?: Record<string, string>; reason?: string; expectedState?: string } = {}) =>
    transitionWorkflow({ requestId, organizationId: org.id, userId: user.id, to, ...extra,
      expectedState: extra.expectedState ?? (await row(requestId)).workflow_state })
  const moves = async (id: string) => (await query<{ metadata: Record<string, unknown> }>(
    `SELECT metadata FROM activity_log WHERE request_id = $1 AND action = 'STATUS_CHANGED' ORDER BY created_at, id`, [id])).rows.map(r => r.metadata)

  it('walks a change request from Submitted to Closed, recording details, activity and notifications', async () => {
    const { id } = await createTestChangeRequest(org, requester, 'Rotate the VPN certificates')
    await move(id, reviewer, 'ASSESSING')
    await move(id, reviewer, 'AWAITING_APPROVAL', { fields: { implementationPlan: '  Two waves, EU first  ' } })
    await move(id, admin, 'SCHEDULED')
    await move(id, reviewer, 'IMPLEMENTING')
    await move(id, reviewer, 'VALIDATING', { fields: { implementationEvidence: 'Change ticket 42 applied' } })
    await move(id, reviewer, 'CLOSED', { fields: { validationNotes: 'All tunnels up' } })

    expect(await row(id)).toEqual({ workflow_state: 'CLOSED', workflow_version: 1, workflow_data: {
      implementationPlan: 'Two waves, EU first', implementationEvidence: 'Change ticket 42 applied', validationNotes: 'All tunnels up',
    } })
    expect((await moves(id)).map(m => [m.from, m.to, m.workflowVersion])).toEqual([
      ['SUBMITTED', 'ASSESSING', 1], ['ASSESSING', 'AWAITING_APPROVAL', 1], ['AWAITING_APPROVAL', 'SCHEDULED', 1],
      ['SCHEDULED', 'IMPLEMENTING', 1], ['IMPLEMENTING', 'VALIDATING', 1], ['VALIDATING', 'CLOSED', 1],
    ])
    const notified = await query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'STATUS_CHANGED' AND link = $2`, [requester.id, `/requests/${id}`])
    expect(notified.rows[0].n).toBe(6)
  })

  it('refuses illegal moves, missing details, missing reasons and too-low roles, changing nothing', async () => {
    const { id } = await createTestChangeRequest(org, requester)
    await expect(move(id, reviewer, 'SCHEDULED')).rejects.toThrow(/Cannot move from Submitted to Scheduled/)
    await expect(move(id, requester, 'ASSESSING')).rejects.toThrow(/reviewer/i)
    await expect(move(id, reviewer, 'REJECTED', { reason: '   ' })).rejects.toThrow(/reason/i)
    await move(id, reviewer, 'ASSESSING', { expectedState: 'SUBMITTED' })
    await expect(move(id, reviewer, 'REJECTED', { expectedState: 'SUBMITTED', reason: 'Duplicate' })).rejects.toThrow(/moved on/)
    await expect(move(id, reviewer, 'AWAITING_APPROVAL', { fields: { implementationPlan: '  ' } })).rejects.toThrow(/Implementation plan/)
    await move(id, reviewer, 'AWAITING_APPROVAL', { fields: { implementationPlan: 'Swap the relay' } })
    await expect(move(id, reviewer, 'SCHEDULED')).rejects.toThrow(/admin/i)
    await expect(transitionWorkflow({ requestId: id, organizationId: otherOrg.id, userId: outsider.id, to: 'SCHEDULED', expectedState: 'AWAITING_APPROVAL' })).rejects.toThrow(/not found/i)

    expect((await row(id)).workflow_state).toBe('AWAITING_APPROVAL')
    expect(await moves(id)).toHaveLength(2)
  })

  it('leaves product requests to their own lifecycle', async () => {
    const { id } = await createTestRequest(org, requester)
    await expect(move(id, admin, 'ASSESSING')).rejects.toThrow(/change requests/i)
  })

  it('lets only one of two concurrent moves win', async () => {
    const { id } = await createTestChangeRequest(org, requester)
    // Both people saw Submitted; ASSESSING > REJECTED is legal too, so only the state check stops the second.
    const results = await Promise.allSettled([
      move(id, reviewer, 'ASSESSING', { expectedState: 'SUBMITTED' }),
      move(id, reviewer, 'REJECTED', { expectedState: 'SUBMITTED', reason: 'Duplicate of the VPN change' }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await moves(id)).toHaveLength(1)
  })

  it('reopens with a reason and stays on the workflow version the request started on', async () => {
    const { id } = await createTestChangeRequest(org, requester)
    await move(id, reviewer, 'REJECTED', { reason: 'Not needed' })
    await move(id, reviewer, 'ASSESSING', { reason: 'Vendor changed the deadline' })
    expect((await moves(id)).at(-1)).toMatchObject({ from: 'REJECTED', to: 'ASSESSING', reason: 'Vendor changed the deadline' })

    await query('UPDATE feature_requests SET workflow_version = 99 WHERE id = $1', [id])
    await expect(move(id, reviewer, 'REJECTED', { reason: 'x' })).rejects.toThrow(/version 99/)
  })
})
