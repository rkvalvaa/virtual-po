import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { submitStepApproval } from './engine'
import { query } from '@/lib/db/pool'
import {
  createWorkflow,
  replaceSteps,
  updateWorkflow,
  listRequestApprovals,
} from '@/lib/db/queries/approval-workflows'
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests'
import { getDecisionsByRequestId } from '@/lib/db/queries/decisions'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

/**
 * Nothing is mocked: notifyUser only writes a notifications row, and its email
 * side is a no-op unless RESEND_API_KEY is set (see lib/email/send.ts).
 */
describe.skipIf(!hasDb())('submitStepApproval (2-step chain)', () => {
  let org: TestOrg
  let requester: TestUser
  let reviewer: TestUser
  let admin: TestUser
  let userIds: string[]
  let requestId: string
  let stepIds: string[]

  beforeAll(async () => {
    org = await createTestOrg('chain-test')
    requester = await createTestUser(org, 'STAKEHOLDER')
    reviewer = await createTestUser(org, 'REVIEWER')
    admin = await createTestUser(org, 'ADMIN')
    userIds = [requester.id, reviewer.id, admin.id]
  })

  afterAll(async () => {
    await cleanupTestOrg(org, userIds)
  })

  beforeEach(async () => {
    await query(`DELETE FROM approval_workflows WHERE organization_id = $1`, [org.id])

    const workflow = await createWorkflow(org.id, 'Two-step chain', null)
    const steps = await replaceSteps(org.id, workflow.id, [
      { name: 'Reviewer sign-off', approverRole: 'REVIEWER', approverUserId: null },
      { name: 'Exec sign-off', approverRole: null, approverUserId: admin.id },
    ])
    stepIds = steps.map((s) => s.id)
    await updateWorkflow(org.id, workflow.id, { isActive: true })

    const request = await createTestRequest(org, requester, 'Chain integration test')
    requestId = request.id
    await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [
      requestId,
    ])
  })

  it('should approve the request only after every step has approved', async () => {
    const first = await submitStepApproval({
      requestId,
      orgId: org.id,
      userId: reviewer.id,
      role: 'REVIEWER',
      decision: 'APPROVED',
      rationale: 'Scope is clear',
    })

    expect(first.status).toBe('RECORDED')
    expect((await getFeatureRequestById(requestId))?.status).toBe('UNDER_REVIEW')

    // The named approver for step 2 is notified that it is their turn.
    const notified = await query(
      `SELECT id FROM notifications
       WHERE request_id = $1 AND user_id = $2 AND type = 'REVIEW_NEEDED'`,
      [requestId, admin.id]
    )
    expect(notified.rows.length).toBeGreaterThan(0)

    const second = await submitStepApproval({
      requestId,
      orgId: org.id,
      userId: admin.id,
      role: 'ADMIN',
      decision: 'APPROVED',
      rationale: 'Approved',
    })

    expect(second.status).toBe('APPROVED')
    expect((await getFeatureRequestById(requestId))?.status).toBe('APPROVED')

    const approvals = await listRequestApprovals(requestId)
    expect(approvals.map((a) => a.stepId)).toEqual(stepIds)

    // The chain finishes through applyDecision, so a normal decision exists.
    const decisions = await getDecisionsByRequestId(requestId)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].decision).toBe('APPROVE')
  })

  it('should reject the request immediately when any step rejects', async () => {
    const result = await submitStepApproval({
      requestId,
      orgId: org.id,
      userId: reviewer.id,
      role: 'REVIEWER',
      decision: 'REJECTED',
      rationale: 'Not worth the effort',
    })

    expect(result.status).toBe('REJECTED')
    expect((await getFeatureRequestById(requestId))?.status).toBe('REJECTED')

    const decisions = await getDecisionsByRequestId(requestId)
    expect(decisions[0].decision).toBe('REJECT')
    expect(decisions[0].rationale).toBe('Not worth the effort')
  })

  it('should refuse a user who is not the current step approver', async () => {
    await expect(
      submitStepApproval({
        requestId,
        orgId: org.id,
        userId: requester.id,
        role: 'STAKEHOLDER',
        decision: 'APPROVED',
        rationale: '',
      })
    ).rejects.toThrow('not an approver')
  })

  it('should refuse the named approver while an earlier step is pending', async () => {
    // The admin owns step 2; canActOnStep is only ever asked about step 1 here.
    await expect(
      submitStepApproval({
        requestId,
        orgId: org.id,
        userId: admin.id,
        role: 'ADMIN',
        decision: 'APPROVED',
        rationale: '',
      })
    ).resolves.toMatchObject({ status: 'RECORDED' })

    // ...because ADMIN outranks the REVIEWER role on step 1. Step 2 is now
    // pending and only the named admin may act on it.
    await expect(
      submitStepApproval({
        requestId,
        orgId: org.id,
        userId: reviewer.id,
        role: 'REVIEWER',
        decision: 'APPROVED',
        rationale: '',
      })
    ).rejects.toThrow('not an approver')
  })

  it('should refuse a request from another org', async () => {
    const other = await createTestOrg('chain-other')

    await expect(
      submitStepApproval({
        requestId,
        orgId: other.id,
        userId: reviewer.id,
        role: 'REVIEWER',
        decision: 'APPROVED',
        rationale: '',
      })
    ).rejects.toThrow('Feature request not found')

    await cleanupTestOrg(other)
  })

  it('should refuse to act on a request that is not under review', async () => {
    await query(`UPDATE feature_requests SET status = 'DEFERRED' WHERE id = $1`, [
      requestId,
    ])

    await expect(
      submitStepApproval({
        requestId,
        orgId: org.id,
        userId: reviewer.id,
        role: 'REVIEWER',
        decision: 'APPROVED',
        rationale: '',
      })
    ).rejects.toThrow('not under review')
  })
})
