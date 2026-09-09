// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'REVIEWER' }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: vi.fn(async () => ({ user: actor })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { reconcileCapacityAction, updatePlanningRequestAction } from './actions'

describe.skipIf(!hasDb())('planning actions', () => {
  let org: TestOrg
  let user: TestUser

  beforeAll(async () => {
    org = await createTestOrg('planning-actions')
    user = await createTestUser(org, 'REVIEWER')
  })
  afterAll(async () => cleanupTestOrg(org, [user.id]))
  beforeEach(() => Object.assign(actor, { id: user.id, orgId: org.id, role: 'REVIEWER' }))

  it('lets a current reviewer save a validated planning row', async () => {
    const request = await createTestRequest(org, user, 'Action plan')
    const row = await query<{ updated_at: Date; planning_version: number }>(`SELECT updated_at,planning_version FROM feature_requests WHERE id=$1`, [request.id])
    const form = new FormData()
    form.set('requestId', request.id)
    form.set('expectedUpdatedAt', row.rows[0].updated_at.toISOString())
    form.set('expectedPlanningVersion', String(row.rows[0].planning_version))
    form.set('commitment', 'NOW')
    form.set('targetPeriod', '2027-Q3')
    form.set('manualRank', '1')
    form.set('plannedEffortDays', '3.5')
    form.set('assigneeId', user.id)
    form.set('objectiveId', '')
    expect(await updatePlanningRequestAction(form)).toEqual({ success: true })
    expect((await query(`SELECT planning_commitment,target_period,planned_effort_days FROM feature_requests WHERE id=$1`, [request.id])).rows[0])
      .toMatchObject({ planning_commitment: 'NOW', target_period: '2027-Q3', planned_effort_days: '3.50' })
  })

  it('denies stakeholders and reserves capacity reconciliation for administrators', async () => {
    const request = await createTestRequest(org, user, 'Denied plan')
    const row = await query<{ updated_at: Date; planning_version: number }>(`SELECT updated_at,planning_version FROM feature_requests WHERE id=$1`, [request.id])
    actor.role = 'STAKEHOLDER'
    const form = new FormData()
    form.set('requestId', request.id)
    form.set('expectedUpdatedAt', row.rows[0].updated_at.toISOString())
    form.set('expectedPlanningVersion', String(row.rows[0].planning_version))
    form.set('commitment', 'LATER')
    expect((await updatePlanningRequestAction(form)).error).toMatch(/reviewer/i)

    await query(`INSERT INTO team_capacity(organization_id,quarter,total_capacity_days,allocated_days,updated_by) VALUES($1,'2029-Q1',20,10,$2)`, [org.id, user.id])
    const reconcile = new FormData()
    reconcile.set('quarter', '2029-Q1')
    reconcile.set('reconciliation', 'REPLACED_BY_REQUESTS')
    expect((await reconcileCapacityAction(reconcile)).error).toMatch(/admin/i)
  })
})
