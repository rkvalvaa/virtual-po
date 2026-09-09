// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestOrg,
  createTestOrg,
  createTestRequest,
  createTestUser,
  hasDb,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { upsertCapacity } from './capacity'
import {
  getPlanningBoard,
  getPlanningCapacity,
  reconcilePlanningCapacity,
  updateRequestPlanning,
} from './planning'

describe.skipIf(!hasDb())('capacity planning (CCT-2073)', () => {
  let org: TestOrg
  let foreignOrg: TestOrg
  let admin: TestUser
  let reviewer: TestUser
  let member: TestUser
  let foreignMember: TestUser

  beforeAll(async () => {
    org = await createTestOrg('planning')
    foreignOrg = await createTestOrg('planning-other')
    admin = await createTestUser(org, 'ADMIN')
    reviewer = await createTestUser(org, 'REVIEWER')
    member = await createTestUser(org, 'STAKEHOLDER')
    foreignMember = await createTestUser(foreignOrg, 'STAKEHOLDER')
  })

  afterAll(async () => {
    await cleanupTestOrg(foreignOrg, [foreignMember.id])
    await cleanupTestOrg(org, [admin.id, reviewer.id, member.id])
  })

  it('updates planning fields atomically, preserves AI priority, and writes a separate audit event', async () => {
    const request = await createTestRequest(org, member, 'Plan me')
    const objective = await query<{ id: string }>(
      `INSERT INTO objectives(organization_id,title,time_frame,created_by)
       VALUES($1,'Retention','2026-Q4',$2) RETURNING id`,
      [org.id, admin.id],
    )
    await query(`UPDATE feature_requests SET priority_score=87 WHERE id=$1`, [request.id])
    const before = await query<{ updated_at: Date; planning_version: number }>(`SELECT updated_at,planning_version FROM feature_requests WHERE id=$1`, [request.id])

    await updateRequestPlanning({
      organizationId: org.id,
      requestId: request.id,
      actorId: reviewer.id,
      expectedUpdatedAt: before.rows[0].updated_at,
      expectedPlanningVersion: before.rows[0].planning_version,
      assigneeId: member.id,
      commitment: 'NOW',
      targetPeriod: '2026-Q4',
      manualRank: 2,
      objectiveId: objective.rows[0].id,
      plannedEffortDays: 12.5,
    })

    const board = await getPlanningBoard(org.id)
    const item = board.find(row => row.id === request.id)
    expect(item).toMatchObject({
      assigneeId: member.id,
      commitment: 'NOW',
      targetPeriod: '2026-Q4',
      manualRank: 2,
      objectiveId: objective.rows[0].id,
      plannedEffortDays: 12.5,
      priorityScore: 87,
      planningVersion: 1,
    })
    const audit = await query(
      `SELECT actor_id,changes FROM request_planning_events WHERE request_id=$1`,
      [request.id],
    )
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0].actor_id).toBe(reviewer.id)
    expect(audit.rows[0].changes).toMatchObject({
      commitment: { from: null, to: 'NOW' },
      plannedEffortDays: { from: null, to: 12.5 },
    })
  })

  it('rejects stale edits, foreign assignments, inactive objectives, foreign requests, and archived requests', async () => {
    const request = await createTestRequest(org, member, 'Protected plan')
    const objective = await query<{ id: string }>(
      `INSERT INTO objectives(organization_id,title,time_frame,status,created_by)
       VALUES($1,'Closed objective','2026-Q4','CANCELLED',$2) RETURNING id`,
      [org.id, admin.id],
    )
    const before = await query<{ updated_at: Date; planning_version: number }>(`SELECT updated_at,planning_version FROM feature_requests WHERE id=$1`, [request.id])

    await expect(updateRequestPlanning({ organizationId: org.id, requestId: request.id, actorId: reviewer.id,
      expectedUpdatedAt: before.rows[0].updated_at, expectedPlanningVersion: 0, assigneeId: foreignMember.id })).rejects.toThrow(/current member/i)
    await expect(updateRequestPlanning({ organizationId: org.id, requestId: request.id, actorId: reviewer.id,
      expectedUpdatedAt: before.rows[0].updated_at, expectedPlanningVersion: 0, objectiveId: objective.rows[0].id })).rejects.toThrow(/active objective/i)
    await expect(updateRequestPlanning({ organizationId: foreignOrg.id, requestId: request.id, actorId: reviewer.id,
      expectedUpdatedAt: before.rows[0].updated_at, expectedPlanningVersion: 0, commitment: 'NEXT' })).rejects.toThrow(/permission|unavailable/i)

    await query(`UPDATE feature_requests SET summary='later local edit',updated_at=clock_timestamp()+interval '1 second' WHERE id=$1`, [request.id])
    await expect(updateRequestPlanning({ organizationId: org.id, requestId: request.id, actorId: reviewer.id,
      expectedUpdatedAt: before.rows[0].updated_at, expectedPlanningVersion: 0, commitment: 'NEXT' })).rejects.toThrow(/changed/i)
    await query(`UPDATE feature_requests SET archived_at=clock_timestamp(),archived_by=$2 WHERE id=$1`, [request.id, admin.id])
    const current = await query<{ updated_at: Date; planning_version: number }>(`SELECT updated_at,planning_version FROM feature_requests WHERE id=$1`, [request.id])
    await expect(updateRequestPlanning({ organizationId: org.id, requestId: request.id, actorId: reviewer.id,
      expectedUpdatedAt: current.rows[0].updated_at, expectedPlanningVersion: current.rows[0].planning_version, commitment: 'LATER' })).rejects.toThrow(/archived|unavailable/i)
  })

  it('keeps story points separate from day estimates and excludes archived work', async () => {
    const estimated = await createTestRequest(org, member, 'Points are not days')
    const archived = await createTestRequest(org, member, 'Archived plan')
    const epic = await query<{ id: string }>(`INSERT INTO epics(request_id,title) VALUES($1,'Epic') RETURNING id`, [estimated.id])
    await query(
      `INSERT INTO user_stories(epic_id,title,as_a,i_want,so_that,story_points)
       VALUES($1,'Known','user','thing','value',8),($1,'Unknown','user','thing','value',NULL)`,
      [epic.rows[0].id],
    )
    await query(`UPDATE feature_requests SET target_period='2028-Q4',planning_commitment='NEXT' WHERE id=$1`, [estimated.id])
    await query(`UPDATE feature_requests SET target_period='2028-Q4',planned_effort_days=99,archived_at=NOW(),archived_by=$2 WHERE id=$1`, [archived.id, admin.id])

    const item = (await getPlanningBoard(org.id)).find(row => row.id === estimated.id)
    expect(item).toMatchObject({ plannedEffortDays: null, storyPointsTotal: 8, unknownStoryPointsCount: 1 })
    expect((await getPlanningBoard(org.id)).find(row => row.id === archived.id)).toBeUndefined()
    const capacity = await getPlanningCapacity(org.id, '2028-Q4')
    expect(capacity.requestDerivedDays).toBe(0)
    expect(capacity.unknownRequestEstimates).toBeGreaterThanOrEqual(1)
  })

  it('preserves legacy allocation and prevents double counting until explicitly reconciled', async () => {
    await upsertCapacity(org.id, '2027-Q1', 100, 70, 'legacy plan', admin.id)
    const planned = await createTestRequest(org, member, 'Forty days')
    const unknown = await createTestRequest(org, member, 'Unknown days')
    await query(`UPDATE feature_requests SET target_period='2027-Q1',planned_effort_days=40 WHERE id=$1`, [planned.id])
    await query(`UPDATE feature_requests SET target_period='2027-Q1' WHERE id=$1`, [unknown.id])

    expect(await getPlanningCapacity(org.id, '2027-Q1')).toMatchObject({
      totalCapacityDays: 100,
      legacyAllocatedDays: 70,
      requestDerivedDays: 40,
      unknownRequestEstimates: 1,
      reconciliation: null,
      effectiveAllocatedDays: null,
      remainingDays: null,
      overAllocatedDays: null,
    })

    await reconcilePlanningCapacity(org.id, '2027-Q1', 'REPLACED_BY_REQUESTS', admin.id)
    expect(await getPlanningCapacity(org.id, '2027-Q1')).toMatchObject({
      legacyAllocatedDays: 70,
      requestDerivedDays: 40,
      reconciliation: 'REPLACED_BY_REQUESTS',
      effectiveAllocatedDays: 40,
      remainingDays: 60,
      overAllocatedDays: 0,
    })
    expect((await query(`SELECT allocated_days FROM team_capacity WHERE organization_id=$1 AND quarter='2027-Q1'`, [org.id])).rows[0].allocated_days).toBe('70')

    await reconcilePlanningCapacity(org.id, '2027-Q1', 'RETAINED_AS_OUTSIDE_WORK', admin.id)
    expect(await getPlanningCapacity(org.id, '2027-Q1')).toMatchObject({
      effectiveAllocatedDays: 110,
      remainingDays: -10,
      overAllocatedDays: 10,
    })
  })

  it('clears a prior reconciliation when an administrator changes the legacy allocation', async () => {
    await upsertCapacity(org.id, '2027-Q2', 90, 30, null, admin.id)
    await reconcilePlanningCapacity(org.id, '2027-Q2', 'RETAINED_AS_OUTSIDE_WORK', admin.id)
    await upsertCapacity(org.id, '2027-Q2', 90, 35, null, admin.id)
    expect((await getPlanningCapacity(org.id, '2027-Q2')).reconciliation).toBeNull()
  })
})
