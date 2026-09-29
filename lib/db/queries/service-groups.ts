import { z } from 'zod';
import { query, transaction } from '@/lib/db/pool';
import { lockOrganizationAdmin } from '@/lib/auth/organization-admin';
import { logActivity } from './activity-log';
import { notifyUser } from './notifications';

export type GroupRole = 'MEMBER' | 'LEAD';
export interface ServiceGroupMember { userId: string; name: string | null; email: string; role: GroupRole }
export interface ServiceGroup { id: string; name: string; fallbackOwnerId: string; fallbackOwnerName: string; members: ServiceGroupMember[] }

const groupName = z.string().trim().min(1).max(120);

/** Active groups with their fallback owner and members. */
export async function listServiceGroups(orgId: string): Promise<ServiceGroup[]> {
  const groups = await query(`SELECT g.id, g.name, g.fallback_owner_id, COALESCE(u.name, u.email) AS owner_name
    FROM service_groups g JOIN users u ON u.id = g.fallback_owner_id
    WHERE g.organization_id = $1 AND g.archived_at IS NULL ORDER BY lower(g.name)`, [orgId]);
  const members = await query(`SELECT m.group_id, m.user_id, m.role, u.name, u.email FROM service_group_members m
    JOIN service_groups g ON g.id = m.group_id AND g.archived_at IS NULL JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = $1 ORDER BY m.role DESC, lower(COALESCE(u.name, u.email))`, [orgId]);
  return groups.rows.map(g => ({
    id: g.id, name: g.name, fallbackOwnerId: g.fallback_owner_id, fallbackOwnerName: g.owner_name,
    members: members.rows.filter(m => m.group_id === g.id).map(m => ({ userId: m.user_id, name: m.name, email: m.email, role: m.role })),
  }));
}

export async function createServiceGroup(orgId: string, actorId: string, input: { name: string; fallbackOwnerId: string }): Promise<{ id: string }> {
  const name = groupName.parse(input.name);
  return administer(orgId, actorId, async () => {
    await assertWorkspaceMember(orgId, input.fallbackOwnerId);
    const created = await uniqueName(() => query<{ id: string }>(
      'INSERT INTO service_groups (organization_id, name, fallback_owner_id) VALUES ($1, $2, $3) RETURNING id', [orgId, name, input.fallbackOwnerId]));
    await record(orgId, actorId, created.rows[0].id, 'create', { name });
    return { id: created.rows[0].id };
  });
}

export async function renameServiceGroup(orgId: string, actorId: string, groupId: string, rawName: string): Promise<void> {
  const name = groupName.parse(rawName);
  await administer(orgId, actorId, async () => {
    await lockActiveGroup(orgId, groupId);
    await uniqueName(() => query('UPDATE service_groups SET name = $2 WHERE id = $1', [groupId, name]));
    await record(orgId, actorId, groupId, 'rename', { name });
  });
}

export async function archiveServiceGroup(orgId: string, actorId: string, groupId: string): Promise<void> {
  await administer(orgId, actorId, async () => {
    await lockActiveGroup(orgId, groupId);
    await query('UPDATE service_groups SET archived_at = NOW() WHERE id = $1', [groupId]);
    await record(orgId, actorId, groupId, 'archive');
  });
}

export async function setFallbackOwner(orgId: string, actorId: string, groupId: string, userId: string): Promise<void> {
  await administer(orgId, actorId, async () => {
    await lockActiveGroup(orgId, groupId);
    await assertWorkspaceMember(orgId, userId);
    await query('UPDATE service_groups SET fallback_owner_id = $2 WHERE id = $1', [groupId, userId]);
    await record(orgId, actorId, groupId, 'fallback-owner', { userId });
  });
}

/** Add a member, or change the role of one already in the group. */
export async function setGroupMember(orgId: string, actorId: string, groupId: string, input: { userId: string; role: GroupRole }): Promise<void> {
  const role = z.enum(['MEMBER', 'LEAD']).parse(input.role);
  await administer(orgId, actorId, async () => {
    await lockActiveGroup(orgId, groupId);
    await assertWorkspaceMember(orgId, input.userId);
    await query(`INSERT INTO service_group_members (group_id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)
      ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [groupId, orgId, input.userId, role]);
    await record(orgId, actorId, groupId, 'member', { userId: input.userId, role });
  });
}

export async function removeGroupMember(orgId: string, actorId: string, groupId: string, userId: string): Promise<void> {
  await administer(orgId, actorId, async () => {
    await lockActiveGroup(orgId, groupId);
    await query('DELETE FROM service_group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    await record(orgId, actorId, groupId, 'remove-member', { userId });
  });
}

/**
 * Before a member leaves the workspace: refuse while they are an active group's
 * fallback owner, and hand their assigned group requests to each group's
 * fallback owner. Call inside the removal's transaction.
 */
export async function releaseGroupDuties(orgId: string, userId: string): Promise<void> {
  const owned = await query<{ name: string }>(`SELECT name FROM service_groups
    WHERE organization_id = $1 AND fallback_owner_id = $2 AND archived_at IS NULL ORDER BY lower(name) LIMIT 1`, [orgId, userId]);
  if (owned.rowCount) throw new Error(`Set another fallback owner for "${owned.rows[0].name}" in Settings before removing this member.`);
  await query(`UPDATE feature_requests r SET assignee_id = g.fallback_owner_id, updated_at = NOW()
    FROM service_groups g WHERE g.id = r.service_group_id AND g.fallback_owner_id IS NOT NULL
      AND r.organization_id = $1 AND r.assignee_id = $2`, [orgId, userId]);
}

/** A group's leads and its fallback owner hear about a request that arrives in the group. */
export async function notifyGroup(orgId: string, groupId: string, request: { id: string; title: string }, message: string, actorId: string): Promise<void> {
  const people = await query<{ user_id: string }>(`SELECT fallback_owner_id AS user_id FROM service_groups WHERE id = $1 AND fallback_owner_id IS NOT NULL
    UNION SELECT user_id FROM service_group_members WHERE group_id = $1 AND role = 'LEAD'`, [groupId]);
  for (const { user_id: userId } of people.rows) {
    await notifyUser({ organizationId: orgId, userId, type: 'REVIEW_NEEDED', title: 'New change request in your group',
      message: `"${request.title}" ${message}`, link: `/requests/${request.id}`, requestId: request.id, actorId });
  }
}

function administer<T>(orgId: string, actorId: string, work: () => Promise<T>): Promise<T> {
  return transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    return work();
  });
}

async function lockActiveGroup(orgId: string, groupId: string): Promise<void> {
  const group = await query('SELECT id FROM service_groups WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL FOR UPDATE', [groupId, orgId]);
  if (!group.rowCount) throw new Error('Service group not found.');
}

async function assertWorkspaceMember(orgId: string, userId: string): Promise<void> {
  const found = await query('SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2', [orgId, userId]);
  if (!found.rowCount) throw new Error('Choose a member of this workspace.');
}

async function uniqueName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if ((error as { constraint?: string }).constraint === 'service_groups_active_name') throw new Error('A group with that name already exists.');
    throw error;
  }
}

async function record(orgId: string, actorId: string, groupId: string, operation: string, details: Record<string, unknown> = {}): Promise<void> {
  await logActivity({ organizationId: orgId, userId: actorId, action: 'SERVICE_GROUP_UPDATED', entityType: 'ORGANIZATION', entityId: orgId,
    metadata: { groupId, operation, ...details } });
}
