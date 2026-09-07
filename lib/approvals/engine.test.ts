import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getApprovalState, canActOnStep, maybeAutoApprove } from './engine'
import type {
  ApprovalStep,
  ApprovalWorkflowWithSteps,
  FeatureRequest,
  RequestApproval,
} from '@/lib/types/database'

// maybeAutoApprove is the one non-pure function under test here; its DB reads
// and the decision pipeline are stubbed so the threshold rule can be exercised
// without Postgres.
let fakeActiveWorkflow: ApprovalWorkflowWithSteps | null = null
let fakeMembers: Array<{ userId: string; role: string }> = []
const applyDecisionMock = vi.fn<(params: unknown) => Promise<void>>(() =>
  Promise.resolve()
)

vi.mock('@/lib/db/queries/approval-workflows', () => ({
  getActiveWorkflow: () => Promise.resolve(fakeActiveWorkflow),
  listRequestApprovals: () => Promise.resolve([]),
  recordStepApproval: vi.fn(),
}))

vi.mock('@/lib/db/queries/organizations', () => ({
  getOrganizationUsers: () => Promise.resolve(fakeMembers),
}))

vi.mock('@/lib/decisions/apply', () => ({
  applyDecision: (params: unknown) => applyDecisionMock(params),
}))

function makeStep(overrides: Partial<ApprovalStep> & { id: string; stepOrder: number }): ApprovalStep {
  return {
    workflowId: 'wf-1',
    name: `Step ${overrides.stepOrder}`,
    approverRole: 'REVIEWER',
    approverUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeWorkflow(steps: ApprovalStep[]): ApprovalWorkflowWithSteps {
  return {
    id: 'wf-1',
    organizationId: 'org-1',
    name: 'Standard approval',
    isActive: true,
    autoApproveMinPriority: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    steps,
  }
}

function makeApproval(
  stepId: string,
  decision: 'APPROVED' | 'REJECTED',
  approverId = 'user-1'
): RequestApproval {
  return {
    id: `approval-${stepId}`,
    requestId: 'req-1',
    stepId,
    approverId,
    decision,
    rationale: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
  }
}

const stepOne = makeStep({ id: 'step-1', stepOrder: 1, name: 'Product review' })
const stepTwo = makeStep({ id: 'step-2', stepOrder: 2, name: 'Engineering review' })
const stepThree = makeStep({ id: 'step-3', stepOrder: 3, name: 'Exec sign-off' })

describe('getApprovalState', () => {
  it('should make the first step pending and later steps waiting when nothing is approved', () => {
    const state = getApprovalState(makeWorkflow([stepOne, stepTwo, stepThree]), [])

    expect(state.steps.map((s) => s.status)).toEqual(['PENDING', 'WAITING', 'WAITING'])
    expect(state.currentStep?.id).toBe('step-1')
    expect(state.isComplete).toBe(false)
    expect(state.isRejected).toBe(false)
  })

  it('should advance the pending step as approvals accumulate in order', () => {
    const state = getApprovalState(makeWorkflow([stepOne, stepTwo, stepThree]), [
      makeApproval('step-1', 'APPROVED'),
    ])

    expect(state.steps.map((s) => s.status)).toEqual(['APPROVED', 'PENDING', 'WAITING'])
    expect(state.currentStep?.id).toBe('step-2')
    expect(state.steps[0].approval?.decision).toBe('APPROVED')
  })

  it('should complete the chain once every step is approved', () => {
    const state = getApprovalState(makeWorkflow([stepOne, stepTwo]), [
      makeApproval('step-1', 'APPROVED'),
      makeApproval('step-2', 'APPROVED'),
    ])

    expect(state.isComplete).toBe(true)
    expect(state.isRejected).toBe(false)
    expect(state.currentStep).toBeNull()
  })

  it('should short-circuit on a rejection and leave later steps waiting', () => {
    const state = getApprovalState(makeWorkflow([stepOne, stepTwo, stepThree]), [
      makeApproval('step-1', 'APPROVED'),
      makeApproval('step-2', 'REJECTED'),
    ])

    expect(state.steps.map((s) => s.status)).toEqual(['APPROVED', 'REJECTED', 'WAITING'])
    expect(state.isRejected).toBe(true)
    expect(state.isComplete).toBe(false)
    expect(state.currentStep).toBeNull()
  })

  it('should order steps by stepOrder regardless of array order', () => {
    const state = getApprovalState(makeWorkflow([stepThree, stepOne, stepTwo]), [])

    expect(state.steps.map((s) => s.step.stepOrder)).toEqual([1, 2, 3])
    expect(state.currentStep?.id).toBe('step-1')
  })

  it('should ignore an approval recorded against a step that is not in the chain', () => {
    const state = getApprovalState(makeWorkflow([stepOne]), [
      makeApproval('step-removed', 'APPROVED'),
    ])

    expect(state.steps.map((s) => s.status)).toEqual(['PENDING'])
    expect(state.isComplete).toBe(false)
  })

  it('should never report an empty chain as complete', () => {
    const state = getApprovalState(makeWorkflow([]), [])

    expect(state.steps).toEqual([])
    expect(state.currentStep).toBeNull()
    expect(state.isComplete).toBe(false)
  })
})

describe('canActOnStep', () => {
  const roleStep = makeStep({ id: 'step-1', stepOrder: 1, approverRole: 'REVIEWER' })
  const adminStep = makeStep({ id: 'step-2', stepOrder: 2, approverRole: 'ADMIN' })
  const userStep = makeStep({
    id: 'step-3',
    stepOrder: 3,
    approverRole: null,
    approverUserId: 'user-9',
  })

  it('should let a matching role act', () => {
    expect(canActOnStep(roleStep, 'user-1', 'REVIEWER')).toBe(true)
  })

  it('should let a higher role act on a lower-role step', () => {
    expect(canActOnStep(roleStep, 'user-1', 'ADMIN')).toBe(true)
  })

  it('should reject a lower role', () => {
    expect(canActOnStep(roleStep, 'user-1', 'STAKEHOLDER')).toBe(false)
    expect(canActOnStep(adminStep, 'user-1', 'REVIEWER')).toBe(false)
  })

  it('should let only the named user act on a user step', () => {
    expect(canActOnStep(userStep, 'user-9', 'STAKEHOLDER')).toBe(true)
    expect(canActOnStep(userStep, 'user-1', 'ADMIN')).toBe(false)
  })
})

describe('maybeAutoApprove', () => {
  function makeRequest(): FeatureRequest {
    return {
      id: 'req-1',
      organizationId: 'org-1',
      status: 'UNDER_REVIEW',
      priorityScore: 90,
      requesterId: 'user-requester',
    } as FeatureRequest
  }

  beforeEach(() => {
    applyDecisionMock.mockClear()
    fakeMembers = [
      { userId: 'user-reviewer', role: 'REVIEWER' },
      { userId: 'user-admin', role: 'ADMIN' },
    ]
    fakeActiveWorkflow = { ...makeWorkflow([stepOne]), autoApproveMinPriority: 80 }
  })

  it('should approve as the org admin when the score clears the threshold', async () => {
    const approved = await maybeAutoApprove(makeRequest())

    expect(approved).toBe(true)
    expect(applyDecisionMock).toHaveBeenCalledWith({
      requestId: 'req-1',
      organizationId: 'org-1',
      userId: 'user-admin',
      decision: 'APPROVE',
      rationale: 'Auto-approved: priority ≥ 80',
    })
  })

  it('should treat the threshold as inclusive', async () => {
    const request = makeRequest()
    request.priorityScore = 80

    expect(await maybeAutoApprove(request)).toBe(true)
  })

  it('should not approve below the threshold', async () => {
    const request = makeRequest()
    request.priorityScore = 79.9

    expect(await maybeAutoApprove(request)).toBe(false)
    expect(applyDecisionMock).not.toHaveBeenCalled()
  })

  it('should do nothing when no threshold is configured', async () => {
    fakeActiveWorkflow = { ...makeWorkflow([stepOne]), autoApproveMinPriority: null }

    expect(await maybeAutoApprove(makeRequest())).toBe(false)
    expect(applyDecisionMock).not.toHaveBeenCalled()
  })

  it('should do nothing when the org has no active workflow', async () => {
    fakeActiveWorkflow = null

    expect(await maybeAutoApprove(makeRequest())).toBe(false)
  })

  it('should do nothing for an unscored request or one not under review', async () => {
    const unscored = makeRequest()
    unscored.priorityScore = null
    expect(await maybeAutoApprove(unscored)).toBe(false)

    const notInReview = makeRequest()
    notInReview.status = 'PENDING_ASSESSMENT'
    expect(await maybeAutoApprove(notInReview)).toBe(false)

    expect(applyDecisionMock).not.toHaveBeenCalled()
  })

  it('should skip auto-approval when the org has no admin to act as', async () => {
    fakeMembers = [{ userId: 'user-reviewer', role: 'REVIEWER' }]

    expect(await maybeAutoApprove(makeRequest())).toBe(false)
    expect(applyDecisionMock).not.toHaveBeenCalled()
  })
})
