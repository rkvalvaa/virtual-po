import { query, transaction } from '@/lib/db/pool';
import { canAccess } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/db/queries/activity-log';
import { notifyRequestOwner } from '@/lib/db/queries/notifications';
import type { UserRole } from '@/lib/types/database';
import { CHANGE_FIELDS, changeWorkflow, findTransition, type ChangeField } from './change-request';

const MAX_FIELD_LENGTH = 10_000;

/** A refusal to show the user as-is. */
export class WorkflowError extends Error {}

/**
 * Move a change request to its next workflow state. The only writer of
 * workflow_state: lock the row, check organization and role, validate the move
 * and the details it needs, then write state, activity and notifications in
 * one transaction.
 *
 * `expectedState` is the state the caller saw. A request that has moved on since
 * is refused, so two people acting on the same screen cannot both succeed.
 */
export async function transitionWorkflow(params: {
  requestId: string;
  organizationId: string | null;
  userId: string;
  expectedState: string;
  to: string;
  fields?: Partial<Record<string, string>>;
  reason?: string;
}): Promise<void> {
  const { requestId, organizationId, userId, expectedState, to } = params;
  await transaction(async () => {
    const found = await query(`SELECT id, organization_id, requester_id, title, request_type, archived_at,
        workflow_version, workflow_state, workflow_data
      FROM feature_requests WHERE id = $1 AND organization_id = $2 FOR UPDATE`, [requestId, organizationId]);
    const request = found.rows[0];
    const member = await query<{ role: UserRole }>(
      'SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2 FOR SHARE', [organizationId, userId]);
    if (!request || !member.rows[0]) throw new WorkflowError('Request not found.');
    if (request.request_type === 'PRODUCT') throw new WorkflowError('Only change requests use this workflow.');
    if (request.archived_at) throw new WorkflowError('Restore this archived request first.');
    if (request.workflow_state !== expectedState) throw new WorkflowError('This request has moved on. Reload and try again.');

    const workflow = changeWorkflow(request.workflow_version);
    const from = request.workflow_state as string;
    const transition = findTransition(workflow, from, to);
    const label = (state: string) => workflow.states[state as keyof typeof workflow.states] ?? state;
    if (!transition) throw new WorkflowError(`Cannot move from ${label(from)} to ${label(to)}.`);
    if (!canAccess(member.rows[0].role, transition.minRole)) throw new WorkflowError(`This step needs the ${transition.minRole} role.`);
    const reason = params.reason?.trim().slice(0, MAX_FIELD_LENGTH) ?? '';
    if (transition.reason && !reason) throw new WorkflowError('Give a reason for this step.');

    const data: Partial<Record<ChangeField, string>> = { ...request.workflow_data };
    for (const field of transition.requires) {
      const given = params.fields?.[field]?.trim().slice(0, MAX_FIELD_LENGTH);
      if (given) data[field] = given;
      if (!data[field]) throw new WorkflowError(`${CHANGE_FIELDS[field]} is required to ${transition.label.toLowerCase()}.`);
    }

    await query('UPDATE feature_requests SET workflow_state = $2, workflow_data = $3, updated_at = NOW() WHERE id = $1',
      [requestId, to, JSON.stringify(data)]);
    await logActivity({
      organizationId: request.organization_id, requestId, userId, action: 'STATUS_CHANGED', entityType: 'REQUEST', entityId: requestId,
      metadata: { from, to, workflowVersion: workflow.version, ...(reason ? { reason } : {}) },
    });
    await notifyRequestOwner({
      organizationId: request.organization_id, requesterId: request.requester_id, type: 'STATUS_CHANGED',
      title: `Change request ${label(to).toLowerCase()}`,
      message: `"${request.title}" moved from ${label(from)} to ${label(to)}.${reason ? ` ${reason}` : ''}`,
      link: `/requests/${requestId}`, requestId, actorId: userId,
    });
  });
}
