import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { isCycleDue, runReviewCycle, getCycleProgress } from './engine'
import { query } from '@/lib/db/pool'
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests'
import { getLatestReviewCycle } from '@/lib/db/queries/review-cycles'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'
import type { ReviewCycleConfig } from './config'

/**
 * Nothing is mocked: notifyUser only writes a notifications row, and its email
 * side is a no-op unless RESEND_API_KEY is set (see lib/email/send.ts).
 */
describe.skipIf(!hasDb())('runReviewCycle', () => {
  let org: TestOrg
  let requester: TestUser
  let reviewer: TestUser
  let stakeholder: TestUser
  let userIds: string[]
  let deferredIds: string[]
  let approvedId: string

  beforeAll(async () => {
    org = await createTestOrg('review-cycle-test')
    requester = await createTestUser(org, 'STAKEHOLDER')
    reviewer = await createTestUser(org, 'REVIEWER')
    stakeholder = await createTestUser(org, 'STAKEHOLDER')
    userIds = [requester.id, reviewer.id, stakeholder.id]
  })

  afterAll(async () => {
    await cleanupTestOrg(org, userIds)
  })

  beforeEach(async () => {
    await query(`DELETE FROM review_cycles WHERE organization_id = $1`, [org.id])
    await query(`DELETE FROM notifications WHERE organization_id = $1`, [org.id])
    await query(`DELETE FROM feature_requests WHERE organization_id = $1`, [org.id])

    const first = await createTestRequest(org, requester, 'Deferred one')
    const second = await createTestRequest(org, requester, 'Deferred two')
    const approved = await createTestRequest(org, requester, 'Already approved')
    deferredIds = [first.id, second.id]
    approvedId = approved.id

    await query(
      `UPDATE feature_requests SET status = 'DEFERRED' WHERE id = ANY($1::uuid[])`,
      [deferredIds]
    )
    await query(`UPDATE feature_requests SET status = 'APPROVED' WHERE id = $1`, [
      approvedId,
    ])
  })

  it('should move every deferred request to UNDER_REVIEW', async () => {
    await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })

    for (const id of deferredIds) {
      const request = await getFeatureRequestById(id)
      expect(request?.status).toBe('UNDER_REVIEW')
    }
  })

  it('should leave requests in other statuses alone', async () => {
    await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })

    const approved = await getFeatureRequestById(approvedId)
    expect(approved?.status).toBe('APPROVED')
  })

  it('should record one cycle row with the re-queued count and ids', async () => {
    const cycle = await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })

    expect(cycle.requeuedCount).toBe(2)
    expect(cycle.requeuedRequestIds.sort()).toEqual([...deferredIds].sort())
    expect(cycle.triggeredBy).toBe('CRON')
    expect(cycle.triggeredByUserId).toBeNull()

    const rows = await query(
      `SELECT COUNT(*)::int AS count FROM review_cycles WHERE organization_id = $1`,
      [org.id]
    )
    expect(rows.rows[0].count).toBe(1)
  })

  it('should notify reviewers with a REVIEW_NEEDED digest linking to /review', async () => {
    await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })

    const result = await query(
      `SELECT message, link FROM notifications
       WHERE organization_id = $1 AND user_id = $2 AND type = 'REVIEW_NEEDED'`,
      [org.id, reviewer.id]
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].message).toBe('2 deferred requests re-queued for review')
    expect(result.rows[0].link).toBe('/review')
  })

  it('should not notify stakeholders', async () => {
    await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })

    const result = await query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE organization_id = $1 AND user_id = $2`,
      [org.id, stakeholder.id]
    )
    expect(result.rows[0].count).toBe(0)
  })

  it('should log a STATUS_CHANGED activity tagged with the review_cycle source', async () => {
    await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })

    const result = await query(
      `SELECT metadata FROM activity_log
       WHERE organization_id = $1 AND request_id = $2 AND action = 'STATUS_CHANGED'`,
      [org.id, deferredIds[0]]
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].metadata).toMatchObject({
      from: 'DEFERRED',
      to: 'UNDER_REVIEW',
      source: 'review_cycle',
    })
  })

  it('should record a MANUAL run against the triggering user', async () => {
    const cycle = await runReviewCycle({
      orgId: org.id,
      triggeredBy: 'MANUAL',
      userId: reviewer.id,
    })
    expect(cycle.triggeredBy).toBe('MANUAL')
    expect(cycle.triggeredByUserId).toBe(reviewer.id)
  })

  it('should still record a cycle with zero re-queued requests and notify nobody', async () => {
    await query(
      `UPDATE feature_requests SET status = 'APPROVED' WHERE id = ANY($1::uuid[])`,
      [deferredIds]
    )

    const cycle = await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })
    expect(cycle.requeuedCount).toBe(0)
    expect(cycle.requeuedRequestIds).toEqual([])

    const result = await query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE organization_id = $1`,
      [org.id]
    )
    expect(result.rows[0].count).toBe(0)
  })

  it('should not be due again on the same day it just ran', async () => {
    const config: ReviewCycleConfig = {
      enabled: true,
      cadence: 'WEEKLY',
      dayOfWeek: new Date().getUTCDay(),
    }
    const now = new Date()

    expect(isCycleDue(config, now, null)).toBe(true)

    await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })
    const latest = await getLatestReviewCycle(org.id)

    expect(latest).not.toBeNull()
    expect(isCycleDue(config, now, latest!.startedAt)).toBe(false)
  })

  it('should report progress as requests leave UNDER_REVIEW', async () => {
    const cycle = await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' })
    expect(await getCycleProgress(cycle)).toEqual({ total: 2, decided: 0 })

    await query(`UPDATE feature_requests SET status = 'APPROVED' WHERE id = $1`, [
      deferredIds[0],
    ])
    expect(await getCycleProgress(cycle)).toEqual({ total: 2, decided: 1 })
  })
})
