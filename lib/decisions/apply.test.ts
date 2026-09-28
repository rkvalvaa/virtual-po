import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { applyDecision } from './apply'
import { query } from '@/lib/db/pool'
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests'
import { getDecisionsByRequestId } from '@/lib/db/queries/decisions'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  activateApprovalChain,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

describe.skipIf(!hasDb())('applyDecision with an active approval chain', () => {
  let org: TestOrg
  let reviewer: TestUser

  beforeAll(async () => {
    org = await createTestOrg('apply-chain')
    reviewer = await createTestUser(org, 'REVIEWER')
    await activateApprovalChain(org, 'Standard approval')
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [reviewer.id])
  })

  it('should refuse a direct approval that would skip the chain', async () => {
    const request = await createTestRequest(org, reviewer, 'Chain-governed request')
    await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [request.id])

    await expect(
      applyDecision({
        requestId: request.id,
        organizationId: org.id,
        userId: reviewer.id,
        decision: 'APPROVE',
        rationale: 'Looks good',
      })
    ).rejects.toThrow('Standard approval')

    expect((await getFeatureRequestById(request.id))?.status).toBe('UNDER_REVIEW')
    expect(await getDecisionsByRequestId(request.id)).toHaveLength(0)
  })
})
