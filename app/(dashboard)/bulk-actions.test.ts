// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateApprovalChain,
  cleanupTestOrg,
  createTestChangeRequest,
  createTestOrg,
  createTestRequest,
  createTestUser,
  hasDb,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests'
import { getDecisionsByRequestId } from '@/lib/db/queries/decisions'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'REVIEWER' }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: vi.fn(async () => ({ user: actor })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { bulkAddTags, bulkUpdateStatus } from './bulk-actions'

async function requestUnderReview(org: TestOrg, user: TestUser): Promise<string> {
  const request = await createTestRequest(org, user, 'Bulk decision')
  await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [request.id])
  return request.id
}

describe.skipIf(!hasDb())('bulkUpdateStatus decisions', () => {
  let org: TestOrg
  let chainOrg: TestOrg
  let reviewer: TestUser
  let chainReviewer: TestUser

  beforeAll(async () => {
    org = await createTestOrg('bulk-decision')
    chainOrg = await createTestOrg('bulk-decision-chain')
    reviewer = await createTestUser(org, 'REVIEWER')
    chainReviewer = await createTestUser(chainOrg, 'REVIEWER')
    await activateApprovalChain(chainOrg, 'Standard approval')
  })
  afterAll(async () => {
    await cleanupTestOrg(org, [reviewer.id])
    await cleanupTestOrg(chainOrg, [chainReviewer.id])
  })
  beforeEach(() => Object.assign(actor, { id: reviewer.id, orgId: org.id, role: 'REVIEWER' }))

  it('should record a decision when bulk-approving', async () => {
    const id = await requestUnderReview(org, reviewer)

    expect(await bulkUpdateStatus([id], 'APPROVED')).toEqual([{ id, success: true }])

    expect((await getFeatureRequestById(id))?.status).toBe('APPROVED')
    const decisions = await getDecisionsByRequestId(id)
    expect(decisions.map((d) => d.decision)).toEqual(['APPROVE'])
  })

  it('should leave change requests untouched by bulk actions', async () => {
    const { id } = await createTestChangeRequest(org, reviewer)
    await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [id])

    expect(await bulkUpdateStatus([id], 'APPROVED')).toEqual([{ id, success: false, error: 'Not found' }])
    await bulkAddTags([id], ['bulk-tag'])

    const after = await getFeatureRequestById(id)
    expect(after?.status).toBe('UNDER_REVIEW')
    expect(after?.tags ?? []).not.toContain('bulk-tag')
    expect(await getDecisionsByRequestId(id)).toEqual([])
  })

  it('should refuse a bulk approval while an approval chain is active', async () => {
    Object.assign(actor, { id: chainReviewer.id, orgId: chainOrg.id })
    const id = await requestUnderReview(chainOrg, chainReviewer)

    const [result] = await bulkUpdateStatus([id], 'APPROVED')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Standard approval')
    expect((await getFeatureRequestById(id))?.status).toBe('UNDER_REVIEW')
  })
})
