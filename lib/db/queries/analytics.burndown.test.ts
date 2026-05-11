import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { getBacklogBurndown } from './analytics'
import { logActivity } from './activity-log'
import { createFeatureRequest } from './feature-requests'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

describe.skipIf(!hasDb())('getBacklogBurndown', () => {
  let org: TestOrg
  let user: TestUser

  beforeAll(async () => {
    org = await createTestOrg('burndown-test')
    user = await createTestUser(org)
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id])
  })

  beforeEach(async () => {
    const { query } = await import('@/lib/db/pool')
    // Wipe per-test so each test sees a clean slate.
    await query(`DELETE FROM activity_log WHERE organization_id = $1`, [org.id])
    await query(`DELETE FROM feature_requests WHERE organization_id = $1`, [org.id])
  })

  it('should return one point per day in the range', async () => {
    const points = await getBacklogBurndown(org.id, { from: '2026-01-01', to: '2026-01-05' })
    expect(points).toHaveLength(5)
    expect(points[0].day).toBe('2026-01-01')
    expect(points[4].day).toBe('2026-01-05')
  })

  it('should produce zero open count when the org has no requests', async () => {
    const points = await getBacklogBurndown(org.id, { from: '2026-01-01', to: '2026-01-03' })
    expect(points.every((p) => p.openCount === 0)).toBe(true)
  })

  it('should set the ideal line to start at startingCount and end at zero', async () => {
    // Seed 3 requests before the range so startingCount = 3.
    for (let i = 0; i < 3; i++) {
      const r = await createFeatureRequest(org.id, user.id, `pre-${i}`)
      const { query } = await import('@/lib/db/pool')
      await query(`UPDATE feature_requests SET created_at = '2025-12-01' WHERE id = $1`, [r.id])
    }
    const points = await getBacklogBurndown(org.id, { from: '2026-01-01', to: '2026-01-05' })
    expect(points[0].idealCount).toBe(3)
    expect(points[points.length - 1].idealCount).toBe(0)
  })

  it('should include in-range creations in the running open count', async () => {
    // Create one request that lands inside the range on 2026-01-02.
    const r = await createFeatureRequest(org.id, user.id, 'inside-range')
    const { query } = await import('@/lib/db/pool')
    await query(`UPDATE feature_requests SET created_at = '2026-01-02' WHERE id = $1`, [r.id])

    const points = await getBacklogBurndown(org.id, { from: '2026-01-01', to: '2026-01-05' })
    expect(points[0].openCount).toBe(0) // day before creation
    expect(points[1].openCount).toBe(1) // creation day
    expect(points[4].openCount).toBe(1) // still open at end
  })

  it('should decrement the open count when STATUS_CHANGED→COMPLETED is logged', async () => {
    // Create a request before the range, then complete it mid-range.
    const r = await createFeatureRequest(org.id, user.id, 'pre-then-completed')
    const { query } = await import('@/lib/db/pool')
    await query(`UPDATE feature_requests SET created_at = '2025-12-01' WHERE id = $1`, [r.id])

    // Activity log entry on 2026-01-03 — completion.
    const al = await logActivity({
      organizationId: org.id,
      userId: user.id,
      action: 'STATUS_CHANGED',
      entityType: 'REQUEST',
      entityId: r.id,
      metadata: { from: 'IN_PROGRESS', to: 'COMPLETED' },
    })
    await query(`UPDATE activity_log SET created_at = '2026-01-03' WHERE id = $1`, [al.id])

    const points = await getBacklogBurndown(org.id, { from: '2026-01-01', to: '2026-01-05' })
    // Days 01, 02 still open (count=1), day 03 onwards completed (count=0).
    expect(points[0].openCount).toBe(1)
    expect(points[1].openCount).toBe(1)
    expect(points[2].openCount).toBe(0)
    expect(points[4].openCount).toBe(0)
  })

  it('should ignore non-COMPLETED STATUS_CHANGED events when computing the delta', async () => {
    const r = await createFeatureRequest(org.id, user.id, 'rejected-not-completed')
    const { query } = await import('@/lib/db/pool')
    await query(`UPDATE feature_requests SET created_at = '2025-12-01' WHERE id = $1`, [r.id])

    const al = await logActivity({
      organizationId: org.id,
      userId: user.id,
      action: 'STATUS_CHANGED',
      entityType: 'REQUEST',
      entityId: r.id,
      metadata: { from: 'UNDER_REVIEW', to: 'REJECTED' },
    })
    await query(`UPDATE activity_log SET created_at = '2026-01-03' WHERE id = $1`, [al.id])

    const points = await getBacklogBurndown(org.id, { from: '2026-01-01', to: '2026-01-05' })
    // REJECTED does not decrement — request stays "open" per the burndown's
    // current definition (which keys off completion specifically).
    expect(points.every((p) => p.openCount === 1)).toBe(true)
  })

  it('should isolate results to the given organization', async () => {
    const otherOrg = await createTestOrg('burndown-isolation')
    const otherUser = await createTestUser(otherOrg)
    try {
      // Their org has 5 pre-range items; we should not see them.
      for (let i = 0; i < 5; i++) {
        const r = await createFeatureRequest(otherOrg.id, otherUser.id, `theirs-${i}`)
        const { query } = await import('@/lib/db/pool')
        await query(`UPDATE feature_requests SET created_at = '2025-12-01' WHERE id = $1`, [r.id])
      }
      const points = await getBacklogBurndown(org.id, { from: '2026-01-01', to: '2026-01-03' })
      expect(points.every((p) => p.openCount === 0)).toBe(true)
    } finally {
      await cleanupTestOrg(otherOrg, [otherUser.id])
    }
  })
})
