import { query, getClient } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type {
  ApprovalDecision,
  ApprovalStep,
  ApprovalWorkflow,
  ApprovalWorkflowWithSteps,
  ApproverRole,
  RequestApproval,
} from '@/lib/types/database';

/** A step as supplied by the settings UI, before it gets an id and an order. */
export interface ApprovalStepInput {
  name: string;
  approverRole: ApproverRole | null;
  approverUserId: string | null;
}

async function getStepsForWorkflows(workflowIds: string[]): Promise<ApprovalStep[]> {
  if (workflowIds.length === 0) return [];
  const result = await query(
    `SELECT * FROM approval_steps
     WHERE workflow_id = ANY($1) AND retired_at IS NULL
     ORDER BY step_order`,
    [workflowIds]
  );
  return mapRows<ApprovalStep>(result.rows);
}

function attachSteps(
  workflows: ApprovalWorkflow[],
  steps: ApprovalStep[]
): ApprovalWorkflowWithSteps[] {
  return workflows.map((w) => ({
    ...w,
    steps: steps.filter((s) => s.workflowId === w.id),
  }));
}

export async function listWorkflows(orgId: string): Promise<ApprovalWorkflowWithSteps[]> {
  const result = await query(
    `SELECT * FROM approval_workflows
     WHERE organization_id = $1
     ORDER BY created_at`,
    [orgId]
  );
  const workflows = mapRows<ApprovalWorkflow>(result.rows);
  const steps = await getStepsForWorkflows(workflows.map((w) => w.id));
  return attachSteps(workflows, steps);
}

/**
 * The org's one active workflow, steps included and ordered.
 *
 * A workflow with zero steps is still returned — callers decide whether an
 * empty chain means "no gate" (it does: see ApprovalChain / DecisionPanel).
 */
export async function getActiveWorkflow(
  orgId: string
): Promise<ApprovalWorkflowWithSteps | null> {
  const result = await query(
    `SELECT * FROM approval_workflows
     WHERE organization_id = $1 AND is_active
     LIMIT 1`,
    [orgId]
  );
  if (result.rows.length === 0) return null;
  const workflow = mapRow<ApprovalWorkflow>(result.rows[0]);
  const steps = await getStepsForWorkflows([workflow.id]);
  return { ...workflow, steps };
}

export async function getWorkflowById(
  orgId: string,
  workflowId: string
): Promise<ApprovalWorkflowWithSteps | null> {
  const result = await query(
    `SELECT * FROM approval_workflows WHERE id = $1 AND organization_id = $2`,
    [workflowId, orgId]
  );
  if (result.rows.length === 0) return null;
  const workflow = mapRow<ApprovalWorkflow>(result.rows[0]);
  const steps = await getStepsForWorkflows([workflow.id]);
  return { ...workflow, steps };
}

export async function createWorkflow(
  orgId: string,
  name: string,
  autoApproveMinPriority: number | null = null
): Promise<ApprovalWorkflow> {
  const result = await query(
    `INSERT INTO approval_workflows (organization_id, name, auto_approve_min_priority)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [orgId, name, autoApproveMinPriority]
  );
  return mapRow<ApprovalWorkflow>(result.rows[0]);
}

/**
 * Update a workflow's settings. Activating one deactivates the org's others in
 * the same transaction — the partial unique index would otherwise reject it.
 */
export async function updateWorkflow(
  orgId: string,
  workflowId: string,
  data: { name?: string; isActive?: boolean; autoApproveMinPriority?: number | null }
): Promise<ApprovalWorkflow | null> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (data.isActive === true) {
      await client.query(
        `UPDATE approval_workflows SET is_active = FALSE
         WHERE organization_id = $1 AND id <> $2 AND is_active`,
        [orgId, workflowId]
      );
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (data.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(data.name);
    }
    if (data.isActive !== undefined) {
      fields.push(`is_active = $${i++}`);
      values.push(data.isActive);
    }
    if (data.autoApproveMinPriority !== undefined) {
      fields.push(`auto_approve_min_priority = $${i++}`);
      values.push(data.autoApproveMinPriority);
    }
    if (fields.length === 0) {
      await client.query('ROLLBACK');
      return getWorkflowById(orgId, workflowId);
    }

    values.push(workflowId, orgId);
    const result = await client.query(
      `UPDATE approval_workflows SET ${fields.join(', ')}
       WHERE id = $${i++} AND organization_id = $${i}
       RETURNING *`,
      values
    );

    await client.query('COMMIT');
    if (result.rows.length === 0) return null;
    return mapRow<ApprovalWorkflow>(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Deleting would cascade to recorded approvals, so a chain with any is kept (deactivate it instead). */
export async function deleteWorkflow(orgId: string, workflowId: string): Promise<void> {
  const used = await query(
    `SELECT 1 FROM request_approvals a JOIN approval_steps s ON s.id = a.step_id
     WHERE s.workflow_id = $1 LIMIT 1`,
    [workflowId]
  );
  if (used.rowCount) throw new Error('This chain has recorded approvals. Deactivate it instead of deleting it.');
  await query(
    `DELETE FROM approval_workflows WHERE id = $1 AND organization_id = $2`,
    [workflowId, orgId]
  );
}

/**
 * Set a workflow's steps, numbered by array position.
 *
 * Never deletes a recorded approval. A step whose approver (role or named
 * user) is unchanged at the same position is kept, renamed if needed, so its
 * approvals still count. A step that changes or disappears is deleted when
 * nothing references it, otherwise retired: its approvals stay as history and
 * the replacement step needs a fresh approval.
 *
 * Transactional: a partial save would leave an active chain with missing
 * steps, silently changing who has to approve what.
 */
export async function replaceSteps(
  orgId: string,
  workflowId: string,
  steps: ApprovalStepInput[]
): Promise<ApprovalStep[]> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Coordinate named approver selection with membership removal/demotion.
    await client.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [orgId]);
    for (const step of steps) {
      if (step.approverUserId) {
        const member = await client.query("SELECT user_id FROM organization_users WHERE organization_id = $1 AND user_id = $2 AND role IN ('ADMIN', 'REVIEWER')", [orgId, step.approverUserId]);
        if (!member.rowCount) throw new Error('Named approver must be a current reviewer or administrator.');
      }
    }

    const owned = await client.query(
      `SELECT id FROM approval_workflows WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [workflowId, orgId]
    );
    if (owned.rows.length === 0) throw new Error('Approval workflow not found');

    const active = (await client.query(
      `SELECT * FROM approval_steps WHERE workflow_id = $1 AND retired_at IS NULL ORDER BY step_order`,
      [workflowId]
    )).rows.map(row => mapRow<ApprovalStep>(row));
    const sameApprover = (current: ApprovalStep | undefined, next: ApprovalStepInput | undefined) =>
      !!current && !!next && current.approverRole === next.approverRole && current.approverUserId === next.approverUserId;

    // Free the positions of steps that are not kept before inserting new ones.
    for (const [index, current] of active.entries()) {
      if (sameApprover(current, steps[index])) continue;
      await client.query(
        `DELETE FROM approval_steps WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM request_approvals WHERE step_id = $1)`,
        [current.id]
      );
      await client.query(`UPDATE approval_steps SET retired_at = NOW() WHERE id = $1`, [current.id]);
    }

    const saved: ApprovalStep[] = [];
    for (const [index, step] of steps.entries()) {
      const current = active[index];
      const result = sameApprover(current, step)
        ? await client.query(`UPDATE approval_steps SET name = $2 WHERE id = $1 RETURNING *`, [current.id, step.name])
        : await client.query(
          `INSERT INTO approval_steps (workflow_id, step_order, name, approver_role, approver_user_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [workflowId, index + 1, step.name, step.approverRole, step.approverUserId]
        );
      saved.push(mapRow<ApprovalStep>(result.rows[0]));
    }

    await client.query('COMMIT');
    return saved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listRequestApprovals(requestId: string): Promise<RequestApproval[]> {
  const result = await query(
    `SELECT * FROM request_approvals
     WHERE request_id = $1
     ORDER BY created_at`,
    [requestId]
  );
  return mapRows<RequestApproval>(result.rows);
}

export interface RequestApprovalWithApprover extends RequestApproval {
  approverName: string | null;
}

export async function listRequestApprovalsWithApprover(
  requestId: string
): Promise<RequestApprovalWithApprover[]> {
  const result = await query(
    `SELECT ra.*, u.name AS approver_name
     FROM request_approvals ra
     LEFT JOIN users u ON u.id = ra.approver_id
     WHERE ra.request_id = $1
     ORDER BY ra.created_at`,
    [requestId]
  );
  return mapRows<RequestApprovalWithApprover>(result.rows);
}

export async function recordStepApproval(params: {
  requestId: string;
  stepId: string;
  approverId: string;
  decision: ApprovalDecision;
  rationale: string | null;
}): Promise<RequestApproval> {
  const result = await query(
    `INSERT INTO request_approvals (request_id, step_id, approver_id, decision, rationale)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.requestId,
      params.stepId,
      params.approverId,
      params.decision,
      params.rationale,
    ]
  );
  return mapRow<RequestApproval>(result.rows[0]);
}
