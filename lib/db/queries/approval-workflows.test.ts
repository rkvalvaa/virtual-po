import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  createWorkflow,
  deleteWorkflow,
  getActiveWorkflow,
  getWorkflowById,
  listRequestApprovals,
  listRequestApprovalsWithApprover,
  listWorkflows,
  recordStepApproval,
  replaceSteps,
  updateWorkflow,
} from './approval-workflows'
import { query } from '@/lib/db/pool'
import { changeOrganizationMember } from './organization-members'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

describe.skipIf(!hasDb())('approval workflow queries', () => {
  let org: TestOrg
  let admin: TestUser
  let reviewer: TestUser
  let userIds: string[]

  beforeAll(async () => {
    org = await createTestOrg('approvals-test')
    admin = await createTestUser(org, 'ADMIN')
    reviewer = await createTestUser(org, 'REVIEWER')
    userIds = [admin.id, reviewer.id]
  })

  afterAll(async () => {
    await cleanupTestOrg(org, userIds)
  })

  beforeEach(async () => {
    await query(`DELETE FROM approval_workflows WHERE organization_id = $1`, [org.id])
  })

  describe('createWorkflow / getWorkflowById', () => {
    it('should create an inactive workflow with no steps', async () => {
      const workflow = await createWorkflow(org.id, 'Standard approval', 75)

      expect(workflow.organizationId).toBe(org.id)
      expect(workflow.name).toBe('Standard approval')
      expect(workflow.isActive).toBe(false)
      expect(workflow.autoApproveMinPriority).toBe(75)

      const fetched = await getWorkflowById(org.id, workflow.id)
      expect(fetched?.steps).toEqual([])
    })

    it('should not return a workflow belonging to another org', async () => {
      const other = await createTestOrg('approvals-other')
      const workflow = await createWorkflow(other.id, 'Other org chain', null)

      expect(await getWorkflowById(org.id, workflow.id)).toBeNull()
      await cleanupTestOrg(other)
    })
  })

  describe('replaceSteps', () => {
    it('should number steps by array position', async () => {
      const workflow = await createWorkflow(org.id, 'Chain', null)
      const steps = await replaceSteps(org.id, workflow.id, [
        { name: 'Product', approverRole: 'REVIEWER', approverUserId: null },
        { name: 'Exec', approverRole: null, approverUserId: admin.id },
      ])

      expect(steps.map((s) => s.stepOrder)).toEqual([1, 2])
      expect(steps[0].approverRole).toBe('REVIEWER')
      expect(steps[1].approverUserId).toBe(admin.id)
    })

    it('should replace previous steps wholesale', async () => {
      const workflow = await createWorkflow(org.id, 'Chain', null)
      await replaceSteps(org.id, workflow.id, [
        { name: 'First', approverRole: 'REVIEWER', approverUserId: null },
        { name: 'Second', approverRole: 'ADMIN', approverUserId: null },
      ])
      await replaceSteps(org.id, workflow.id, [
        { name: 'Only', approverRole: 'ADMIN', approverUserId: null },
      ])

      const fetched = await getWorkflowById(org.id, workflow.id)
      expect(fetched?.steps.map((s) => s.name)).toEqual(['Only'])
    })

    it('should reject a step with both a role and a user', async () => {
      const workflow = await createWorkflow(org.id, 'Chain', null)

      await expect(
        replaceSteps(org.id, workflow.id, [
          { name: 'Bad', approverRole: 'ADMIN', approverUserId: admin.id },
        ])
      ).rejects.toThrow()
    })

    it('should refuse to touch a workflow from another org', async () => {
      const other = await createTestOrg('approvals-other')
      const workflow = await createWorkflow(other.id, 'Other chain', null)

      await expect(
        replaceSteps(org.id, workflow.id, [
          { name: 'Nope', approverRole: 'ADMIN', approverUserId: null },
        ])
      ).rejects.toThrow('Approval workflow not found')

      await cleanupTestOrg(other)
    })
  })

  describe('getActiveWorkflow', () => {
    it('should return null when no workflow is active', async () => {
      await createWorkflow(org.id, 'Inactive', null)
      expect(await getActiveWorkflow(org.id)).toBeNull()
    })

    it('should return the active workflow with its steps ordered', async () => {
      const workflow = await createWorkflow(org.id, 'Chain', null)
      await replaceSteps(org.id, workflow.id, [
        { name: 'One', approverRole: 'REVIEWER', approverUserId: null },
        { name: 'Two', approverRole: 'ADMIN', approverUserId: null },
      ])
      await updateWorkflow(org.id, workflow.id, { isActive: true })

      const active = await getActiveWorkflow(org.id)
      expect(active?.id).toBe(workflow.id)
      expect(active?.steps.map((s) => s.name)).toEqual(['One', 'Two'])
    })

    it('should deactivate the previous workflow when another is activated', async () => {
      const first = await createWorkflow(org.id, 'First', null)
      const second = await createWorkflow(org.id, 'Second', null)
      await updateWorkflow(org.id, first.id, { isActive: true })
      await updateWorkflow(org.id, second.id, { isActive: true })

      const active = await getActiveWorkflow(org.id)
      expect(active?.id).toBe(second.id)

      const all = await listWorkflows(org.id)
      expect(all.filter((w) => w.isActive)).toHaveLength(1)
    })
  })

  describe('updateWorkflow / deleteWorkflow', () => {
    it('should update the auto-approve threshold', async () => {
      const workflow = await createWorkflow(org.id, 'Chain', null)
      const updated = await updateWorkflow(org.id, workflow.id, {
        autoApproveMinPriority: 88,
      })

      expect(updated?.autoApproveMinPriority).toBe(88)
    })

    it('should return null when updating a workflow from another org', async () => {
      const other = await createTestOrg('approvals-other')
      const workflow = await createWorkflow(other.id, 'Other chain', null)

      expect(await updateWorkflow(org.id, workflow.id, { name: 'Hijacked' })).toBeNull()
      await cleanupTestOrg(other)
    })

    it('should cascade steps when the workflow is deleted', async () => {
      const workflow = await createWorkflow(org.id, 'Chain', null)
      await replaceSteps(org.id, workflow.id, [
        { name: 'One', approverRole: 'REVIEWER', approverUserId: null },
      ])
      await deleteWorkflow(org.id, workflow.id)

      const steps = await query(
        `SELECT id FROM approval_steps WHERE workflow_id = $1`,
        [workflow.id]
      )
      expect(steps.rows).toHaveLength(0)
    })
  })

  describe('recordStepApproval / listRequestApprovals', () => {
    it('should record one decision per step and read it back with the approver', async () => {
      const request = await createTestRequest(org, admin, 'Approval query test')
      const workflow = await createWorkflow(org.id, 'Chain', null)
      const [stepOne] = await replaceSteps(org.id, workflow.id, [
        { name: 'One', approverRole: 'REVIEWER', approverUserId: null },
      ])

      await recordStepApproval({
        requestId: request.id,
        stepId: stepOne.id,
        approverId: reviewer.id,
        decision: 'APPROVED',
        rationale: 'Looks good',
      })

      const approvals = await listRequestApprovals(request.id)
      expect(approvals).toHaveLength(1)
      expect(approvals[0].decision).toBe('APPROVED')
      expect(approvals[0].rationale).toBe('Looks good')

      const withApprover = await listRequestApprovalsWithApprover(request.id)
      expect(withApprover[0].approverName).toBeTruthy()
    })

    it('should reject a second decision on the same step', async () => {
      const request = await createTestRequest(org, admin, 'Duplicate step test')
      const workflow = await createWorkflow(org.id, 'Chain', null)
      const [stepOne] = await replaceSteps(org.id, workflow.id, [
        { name: 'One', approverRole: 'REVIEWER', approverUserId: null },
      ])

      await recordStepApproval({
        requestId: request.id,
        stepId: stepOne.id,
        approverId: reviewer.id,
        decision: 'APPROVED',
        rationale: null,
      })

      await expect(
        recordStepApproval({
          requestId: request.id,
          stepId: stepOne.id,
          approverId: admin.id,
          decision: 'REJECTED',
          rationale: null,
        })
      ).rejects.toThrow()
    })
  })

  describe('editing a chain keeps recorded approvals', () => {
    async function chainWithApproval() {
      const request = await createTestRequest(org, admin, 'Mid-chain request')
      const workflow = await createWorkflow(org.id, 'Chain', null)
      const [first, second] = await replaceSteps(org.id, workflow.id, [
        { name: 'Product', approverRole: 'REVIEWER', approverUserId: null },
        { name: 'Exec', approverRole: null, approverUserId: admin.id },
      ])
      await recordStepApproval({ requestId: request.id, stepId: first.id, approverId: reviewer.id, decision: 'APPROVED', rationale: 'Fine' })
      return { request, workflow, first, second }
    }
    const approvalsFor = async (requestId: string) => (await listRequestApprovals(requestId)).map((a) => a.stepId)

    it('keeps steps and approvals when the chain is saved unchanged or only renamed', async () => {
      const { request, workflow, first, second } = await chainWithApproval()
      const saved = await replaceSteps(org.id, workflow.id, [
        { name: 'Product sign-off', approverRole: 'REVIEWER', approverUserId: null },
        { name: 'Exec', approverRole: null, approverUserId: admin.id },
      ])
      expect(saved.map((s) => s.id)).toEqual([first.id, second.id])
      expect(saved[0].name).toBe('Product sign-off')
      expect(await approvalsFor(request.id)).toEqual([first.id])
    })

    it('keeps earlier approvals when a step is added', async () => {
      const { request, workflow, first } = await chainWithApproval()
      const saved = await replaceSteps(org.id, workflow.id, [
        { name: 'Product', approverRole: 'REVIEWER', approverUserId: null },
        { name: 'Exec', approverRole: null, approverUserId: admin.id },
        { name: 'Finance', approverRole: 'ADMIN', approverUserId: null },
      ])
      expect(saved[0].id).toBe(first.id)
      expect(saved.map((s) => s.stepOrder)).toEqual([1, 2, 3])
      expect(await approvalsFor(request.id)).toEqual([first.id])
    })

    it('retires a changed or removed step, keeping its approval as history', async () => {
      const { request, workflow, first } = await chainWithApproval()
      const saved = await replaceSteps(org.id, workflow.id, [
        { name: 'Exec', approverRole: null, approverUserId: admin.id },
      ])
      expect(saved).toHaveLength(1)
      expect(saved[0].id).not.toBe(first.id)
      expect((await getWorkflowById(org.id, workflow.id))?.steps.map((s) => s.name)).toEqual(['Exec'])
      expect(await approvalsFor(request.id)).toEqual([first.id])
      const retired = await query('SELECT retired_at FROM approval_steps WHERE id = $1', [first.id])
      expect(retired.rows[0].retired_at).not.toBeNull()
    })

    it('refuses to delete a chain that has recorded approvals', async () => {
      const { request, workflow } = await chainWithApproval()
      await expect(deleteWorkflow(org.id, workflow.id)).rejects.toThrow(/deactivate/i)
      expect(await listRequestApprovals(request.id)).toHaveLength(1)
    })

    it('lets a member named only on a retired step lose review access', async () => {
      const request = await createTestRequest(org, admin, 'Named approver request')
      const workflow = await createWorkflow(org.id, 'Chain', null)
      const [named] = await replaceSteps(org.id, workflow.id, [{ name: 'Rita', approverRole: null, approverUserId: reviewer.id }])
      await recordStepApproval({ requestId: request.id, stepId: named.id, approverId: reviewer.id, decision: 'APPROVED', rationale: null })
      await replaceSteps(org.id, workflow.id, [{ name: 'Any reviewer', approverRole: 'REVIEWER', approverUserId: null }])

      await changeOrganizationMember(org.id, admin.id, reviewer.id, { kind: 'role', role: 'STAKEHOLDER' })
      const role = await query('SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2', [org.id, reviewer.id])
      expect(role.rows[0].role).toBe('STAKEHOLDER')
      await query("UPDATE organization_users SET role = 'REVIEWER' WHERE organization_id = $1 AND user_id = $2", [org.id, reviewer.id])
    })
  })
})
