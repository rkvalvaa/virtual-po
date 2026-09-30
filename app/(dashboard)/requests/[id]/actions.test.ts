// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'REVIEWER' }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: vi.fn(async () => ({ user: actor })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { transitionStatus } from './actions'

describe.skipIf(!hasDb())('transitionStatus', () => {
  let org: TestOrg
  let reviewer: TestUser

  beforeAll(async () => {
    org = await createTestOrg('transition-status')
    reviewer = await createTestUser(org, 'REVIEWER')
    Object.assign(actor, { id: reviewer.id, orgId: org.id, role: 'REVIEWER' })
  })
  afterAll(async () => cleanupTestOrg(org, [reviewer.id]))

  it('should refuse a decision status so decisions go through submitDecision', async () => {
    const request = await createTestRequest(org, reviewer, 'Quick approve')
    await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [request.id])

    await expect(transitionStatus(request.id, 'APPROVED')).rejects.toThrow('submitDecision')

    expect((await getFeatureRequestById(request.id))?.status).toBe('UNDER_REVIEW')
  })

  it('should move an approved request to the backlog', async () => {
    const request = await createTestRequest(org, reviewer, 'Ready for backlog')
    await query(`UPDATE feature_requests SET status = 'APPROVED' WHERE id = $1`, [request.id])

    await transitionStatus(request.id, 'IN_BACKLOG')

    expect((await getFeatureRequestById(request.id))?.status).toBe('IN_BACKLOG')
  })

  it('should refuse to move an archived request', async () => {
    const request = await createTestRequest(org, reviewer, 'Archived work')
    await query(`UPDATE feature_requests SET status = 'IN_BACKLOG', archived_at = now() WHERE id = $1`, [request.id])

    await expect(transitionStatus(request.id, 'IN_PROGRESS')).rejects.toThrow('archived')

    expect((await getFeatureRequestById(request.id))?.status).toBe('IN_BACKLOG')
  })

  it('should use the current membership role, not the one in the session', async () => {
    const request = await createTestRequest(org, reviewer, 'Demoted reviewer')
    await query(`UPDATE feature_requests SET status = 'IN_BACKLOG' WHERE id = $1`, [request.id])
    await query(`UPDATE organization_users SET role = 'STAKEHOLDER' WHERE organization_id = $1 AND user_id = $2`, [org.id, reviewer.id])

    try {
      await expect(transitionStatus(request.id, 'IN_PROGRESS')).rejects.toThrow('Cannot transition')
    } finally {
      await query(`UPDATE organization_users SET role = 'REVIEWER' WHERE organization_id = $1 AND user_id = $2`, [org.id, reviewer.id])
    }

    expect((await getFeatureRequestById(request.id))?.status).toBe('IN_BACKLOG')
  })
})
