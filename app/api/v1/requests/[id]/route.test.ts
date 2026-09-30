import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PATCH } from './route'
import { query } from '@/lib/db/pool'
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests'
import { getDecisionsByRequestId } from '@/lib/db/queries/decisions'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  createTestApiKey,
  activateApprovalChain,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

function patch(id: string, apiKey: string, body: unknown) {
  const req = new Request(`http://localhost/api/v1/requests/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PATCH(req, { params: Promise.resolve({ id }) })
}

describe.skipIf(!hasDb())('PATCH /api/v1/requests/[id] status changes', () => {
  let org: TestOrg
  let chainOrg: TestOrg
  let reviewer: TestUser
  let stakeholder: TestUser
  let chainReviewer: TestUser
  let reviewerKey: string
  let stakeholderKey: string
  let orphanedKey: string
  let chainKey: string
  let formerReviewer: TestUser
  let formerReviewerKey: string

  async function requestIn(target: TestOrg, owner: TestUser, status: string): Promise<string> {
    const request = await createTestRequest(target, owner, 'API status change')
    await query(`UPDATE feature_requests SET status = $2 WHERE id = $1`, [request.id, status])
    return request.id
  }

  beforeAll(async () => {
    org = await createTestOrg('v1-status')
    chainOrg = await createTestOrg('v1-status-chain')
    reviewer = await createTestUser(org, 'REVIEWER')
    stakeholder = await createTestUser(org, 'STAKEHOLDER')
    chainReviewer = await createTestUser(chainOrg, 'REVIEWER')
    await activateApprovalChain(chainOrg, 'Standard approval')
    reviewerKey = (await createTestApiKey(org, ['write'], reviewer.id)).key
    stakeholderKey = (await createTestApiKey(org, ['write'], stakeholder.id)).key
    orphanedKey = (await createTestApiKey(org, ['write'], null)).key
    chainKey = (await createTestApiKey(chainOrg, ['write'], chainReviewer.id)).key
    formerReviewer = await createTestUser(org, 'REVIEWER')
    formerReviewerKey = (await createTestApiKey(org, ['write'], formerReviewer.id)).key
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [reviewer.id, stakeholder.id, formerReviewer.id])
    await cleanupTestOrg(chainOrg, [chainReviewer.id])
  })

  it('should record an approval as a decision by the key creator', async () => {
    const id = await requestIn(org, reviewer, 'UNDER_REVIEW')

    const res = await patch(id, reviewerKey, { status: 'APPROVED' })

    expect(res.status).toBe(200)
    expect((await getFeatureRequestById(id))?.status).toBe('APPROVED')
    const decisions = await getDecisionsByRequestId(id)
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({ decision: 'APPROVE', userId: reviewer.id })
  })

  it('should refuse an approval while an approval chain is active', async () => {
    const id = await requestIn(chainOrg, chainReviewer, 'UNDER_REVIEW')

    const res = await patch(id, chainKey, { status: 'APPROVED' })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('Standard approval')
    expect((await getFeatureRequestById(id))?.status).toBe('UNDER_REVIEW')
  })

  it('should refuse a decision from a key whose creator is not a reviewer', async () => {
    const id = await requestIn(org, reviewer, 'UNDER_REVIEW')

    const res = await patch(id, stakeholderKey, { status: 'APPROVED' })

    expect(res.status).toBe(403)
    expect((await getFeatureRequestById(id))?.status).toBe('UNDER_REVIEW')
  })

  it('should refuse a decision from a key with no creator', async () => {
    const id = await requestIn(org, reviewer, 'UNDER_REVIEW')

    const res = await patch(id, orphanedKey, { status: 'REJECTED' })

    expect(res.status).toBe(403)
    expect((await getFeatureRequestById(id))?.status).toBe('UNDER_REVIEW')
  })

  it('should refuse a status change the lifecycle does not allow', async () => {
    const id = await requestIn(org, reviewer, 'DRAFT')

    const res = await patch(id, reviewerKey, { status: 'COMPLETED' })

    expect(res.status).toBe(409)
    expect((await getFeatureRequestById(id))?.status).toBe('DRAFT')
  })

  it('should refuse a lifecycle move from a key whose creator is not a reviewer', async () => {
    const id = await requestIn(org, reviewer, 'APPROVED')

    const res = await patch(id, stakeholderKey, { status: 'IN_BACKLOG' })

    expect(res.status).toBe(403)
    expect((await getFeatureRequestById(id))?.status).toBe('APPROVED')
  })

  it('should refuse a lifecycle move from a key with no creator', async () => {
    const id = await requestIn(org, reviewer, 'IN_PROGRESS')

    const res = await patch(id, orphanedKey, { status: 'COMPLETED' })

    expect(res.status).toBe(403)
    expect((await getFeatureRequestById(id))?.status).toBe('IN_PROGRESS')
  })

  it('should refuse a lifecycle move from a key whose creator has left the organization', async () => {
    const id = await requestIn(org, reviewer, 'IN_BACKLOG')
    await query(`DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2`, [org.id, formerReviewer.id])

    const res = await patch(id, formerReviewerKey, { status: 'IN_PROGRESS' })

    expect(res.status).toBe(403)
    expect((await getFeatureRequestById(id))?.status).toBe('IN_BACKLOG')
  })

  it('should refuse a move no user action offers, such as skipping assessment', async () => {
    const id = await requestIn(org, reviewer, 'PENDING_ASSESSMENT')

    const res = await patch(id, reviewerKey, { status: 'UNDER_REVIEW' })

    expect(res.status).toBe(403)
    expect((await getFeatureRequestById(id))?.status).toBe('PENDING_ASSESSMENT')
  })

  it('should still apply a legal non-decision transition', async () => {
    const id = await requestIn(org, reviewer, 'APPROVED')

    const res = await patch(id, reviewerKey, { status: 'IN_BACKLOG' })

    expect(res.status).toBe(200)
    expect((await getFeatureRequestById(id))?.status).toBe('IN_BACKLOG')
  })
})
