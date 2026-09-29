import { query, transaction } from '@/lib/db/pool';
import { changeWorkflow } from '@/lib/workflows/change-request';
import type { DeliveryStatus } from '@/lib/export/delivery';
import type { UserRole } from '@/lib/types/database';
import { logActivity } from './activity-log';
import { notifyUser } from './notifications';
import { notifyGroup, type GroupRole } from './service-groups';

/**
 * Service group queues (CCT-2437). A queue is visible to the group's members
 * and to admins. Every change states the assignment (or group) the person saw,
 * checked under the row lock, so two people acting at once get one winner and a
 * clear error for the other.
 */

export interface QueueGroup { id: string; name: string; myRole: GroupRole | null }
export interface QueueRow {
  id: string; title: string; state: string; stateLabel: string; assigneeId: string | null; assigneeName: string | null;
  createdAt: string; delivery: DeliveryStatus | null;
}
export interface QueueFilters { assignee?: string; state?: string }

export async function listQueueGroups(orgId: string, userId: string, role: UserRole): Promise<QueueGroup[]> {
  const result = await query(`SELECT g.id, g.name, m.role AS my_role FROM service_groups g
    LEFT JOIN service_group_members m ON m.group_id = g.id AND m.user_id = $2
    WHERE g.organization_id = $1 AND g.archived_at IS NULL AND ($3 OR m.user_id IS NOT NULL)
    ORDER BY lower(g.name)`, [orgId, userId, role === 'ADMIN']);
  return result.rows.map(row => ({ id: row.id, name: row.name, myRole: row.my_role }));
}

/** Oldest first; null when the viewer may not see this group's queue. */
export async function listGroupQueue(orgId: string, userId: string, role: UserRole, groupId: string, filters: QueueFilters): Promise<QueueRow[] | null> {
  if (!(await listQueueGroups(orgId, userId, role)).some(group => group.id === groupId)) return null;
  const assignee = filters.assignee === 'me' ? userId : filters.assignee ?? null;
  const result = await query(`SELECT r.id, r.title, r.workflow_state, r.workflow_version, r.assignee_id, COALESCE(u.name, u.email) AS assignee_name,
      r.created_at, t.delivery_status
    FROM feature_requests r LEFT JOIN users u ON u.id = r.assignee_id
    LEFT JOIN tracker_exports t ON t.request_id = r.id AND t.delivery_status IS NOT NULL
    WHERE r.organization_id = $1 AND r.service_group_id = $2 AND r.archived_at IS NULL
      AND ($3::text IS NULL OR r.workflow_state = $3)
      AND ($4::text IS NULL OR ($4 = 'unassigned' AND r.assignee_id IS NULL) OR r.assignee_id::text = $4)
    ORDER BY r.created_at, r.id LIMIT 200`, [orgId, groupId, filters.state ?? null, assignee]);
  return result.rows.map(row => {
    const states = row.workflow_version ? changeWorkflow(row.workflow_version).states : null;
    return {
      id: row.id, title: row.title, state: row.workflow_state, stateLabel: states?.[row.workflow_state as keyof typeof states] ?? row.workflow_state ?? '',
      assigneeId: row.assignee_id, assigneeName: row.assignee_name, createdAt: row.created_at.toISOString(), delivery: row.delivery_status,
    };
  });
}

type Scope = { orgId: string; userId: string; requestId: string };

/** Take an unassigned request in one of your groups. */
export async function claimRequest(scope: Scope): Promise<void> {
  await transaction(async () => {
    const request = await lockGroupRequest(scope);
    if (!(await groupRole(request.groupId, scope.userId))) throw new Error(`Only a member of ${request.groupName} can claim it.`);
    if (request.assigneeId) throw new Error(`This request is already claimed by ${await nameOf(request.assigneeId)}.`);
    await assign(scope, request, scope.userId, { operation: 'claim', from: null, to: scope.userId, toName: await nameOf(scope.userId) });
  });
}

/** Give a request to another member of its group (LEAD or ADMIN, with a reason). */
export async function reassignRequest(scope: Scope & { expectedAssigneeId: string | null; toUserId: string; reason: string }): Promise<void> {
  await transaction(async () => {
    const request = await lockGroupRequest(scope);
    if (request.assigneeId !== scope.expectedAssigneeId) throw new Error('The assignment changed since you looked. Reload and try again.');
    await assertLeadOrAdmin(scope, request);
    const reason = requireReason(scope.reason, 'reassignment');
    if (!(await groupRole(request.groupId, scope.toUserId))) throw new Error(`Choose a member of ${request.groupName}.`);
    if (scope.toUserId === request.assigneeId) throw new Error('The request is already assigned to them.');
    await assign(scope, request, scope.toUserId, { operation: 'reassign', from: request.assigneeId, to: scope.toUserId, toName: await nameOf(scope.toUserId), reason });
  });
}

/** Hand a request to another group, unassigned there (LEAD of its group or ADMIN, with a reason). */
export async function moveRequestToGroup(scope: Scope & { expectedGroupId: string; toGroupId: string; reason: string }): Promise<void> {
  await transaction(async () => {
    const request = await lockGroupRequest(scope);
    if (request.groupId !== scope.expectedGroupId) throw new Error('The request changed group since you looked. Reload and try again.');
    await assertLeadOrAdmin(scope, request);
    const reason = requireReason(scope.reason, 'move');
    if (scope.toGroupId === request.groupId) throw new Error(`The request is already in ${request.groupName}.`);
    const target = await query<{ name: string }>('SELECT name FROM service_groups WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL', [scope.toGroupId, scope.orgId]);
    if (!target.rowCount) throw new Error('Service group not found.');
    await query('UPDATE feature_requests SET service_group_id = $2, assignee_id = NULL, updated_at = NOW() WHERE id = $1', [scope.requestId, scope.toGroupId]);
    await record(scope, { operation: 'move', fromGroup: request.groupId, toGroup: scope.toGroupId, toGroupName: target.rows[0].name, from: request.assigneeId, to: null, reason });
    await notifyGroup(scope.orgId, scope.toGroupId, { id: scope.requestId, title: request.title }, `was moved to ${target.rows[0].name}: ${reason}`, scope.userId);
  });
}

interface LockedRequest { title: string; assigneeId: string | null; groupId: string; groupName: string }

async function lockGroupRequest({ orgId, requestId }: Scope): Promise<LockedRequest> {
  const found = await query(`SELECT r.title, r.assignee_id, r.archived_at, g.id AS group_id, g.name AS group_name FROM feature_requests r
    JOIN service_groups g ON g.id = r.service_group_id WHERE r.id = $1 AND r.organization_id = $2 FOR UPDATE OF r`, [requestId, orgId]);
  const row = found.rows[0];
  if (!row) throw new Error('Request not found in a service group.');
  if (row.archived_at) throw new Error('Restore this archived request first.');
  return { title: row.title, assigneeId: row.assignee_id, groupId: row.group_id, groupName: row.group_name };
}

async function groupRole(groupId: string, userId: string): Promise<GroupRole | null> {
  const member = await query<{ role: GroupRole }>('SELECT role FROM service_group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return member.rows[0]?.role ?? null;
}

async function assertLeadOrAdmin(scope: Scope, request: LockedRequest): Promise<void> {
  if (await groupRole(request.groupId, scope.userId) === 'LEAD') return;
  const admin = await query(`SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2 AND role = 'ADMIN'`, [scope.orgId, scope.userId]);
  if (!admin.rowCount) throw new Error(`Only a lead of ${request.groupName} or an admin can do that.`);
}

function requireReason(raw: string, what: string): string {
  const reason = raw.trim().slice(0, 1000);
  if (!reason) throw new Error(`Give a reason for the ${what}.`);
  return reason;
}

async function nameOf(userId: string): Promise<string> {
  const user = await query<{ name: string }>('SELECT COALESCE(name, email) AS name FROM users WHERE id = $1', [userId]);
  return user.rows[0]?.name ?? 'someone';
}

async function assign(scope: Scope, request: LockedRequest, to: string, metadata: Record<string, unknown>): Promise<void> {
  await query('UPDATE feature_requests SET assignee_id = $2, updated_at = NOW() WHERE id = $1', [scope.requestId, to]);
  await record(scope, { ...metadata, groupId: request.groupId });
  await notifyUser({ organizationId: scope.orgId, userId: to, type: 'REVIEW_NEEDED', title: 'Change request assigned to you',
    message: `"${request.title}" in ${request.groupName} is now yours.`, link: `/requests/${scope.requestId}`, requestId: scope.requestId, actorId: scope.userId });
}

async function record(scope: Scope, metadata: Record<string, unknown>): Promise<void> {
  await logActivity({ organizationId: scope.orgId, requestId: scope.requestId, userId: scope.userId, action: 'ASSIGNMENT_CHANGED',
    entityType: 'REQUEST', entityId: scope.requestId, metadata });
}
