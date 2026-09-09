import { query, transaction } from '@/lib/db/pool';
import { lockOrganizationAdmin } from '@/lib/auth/organization-admin';
import { logActivity } from './activity-log';
import type { UserRole } from '@/lib/types/database';

export type MemberChange = { kind: 'role'; role: UserRole } | { kind: 'remove' } | { kind: 'handover' };

export async function changeOrganizationMember(orgId: string, actorId: string, targetId: string, change: MemberChange): Promise<void> {
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const target = await query('SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2 FOR UPDATE', [orgId, targetId]);
    if (!target.rowCount) throw new Error('Member not found in this organization.');
    const previousRole = target.rows[0].role;
    if (change.kind === 'remove' || (change.kind === 'role' && change.role === 'STAKEHOLDER')) {
      const assigned = await query(`SELECT s.id FROM approval_steps s JOIN approval_workflows w ON w.id = s.workflow_id
        WHERE w.organization_id = $1 AND s.approver_user_id = $2 LIMIT 1`, [orgId, targetId]);
      if (assigned.rowCount) throw new Error('Reassign this member’s named approval steps in Settings before removing their review access.');
    }
    if (change.kind === 'handover') {
      if (targetId === actorId) throw new Error('Choose another member for handover.');
      await query("UPDATE organization_users SET role = 'ADMIN' WHERE organization_id = $1 AND user_id = $2", [orgId, targetId]);
      await query("UPDATE organization_users SET role = 'REVIEWER' WHERE organization_id = $1 AND user_id = $2", [orgId, actorId]);
    } else {
      if (previousRole === 'ADMIN' && (change.kind === 'remove' || change.role !== 'ADMIN')) {
        const admins = await query("SELECT user_id FROM organization_users WHERE organization_id = $1 AND role = 'ADMIN'", [orgId]);
        if (admins.rows.length <= 1) throw new Error('The last administrator cannot be removed or demoted. Hand over administration first.');
      }
      if (change.kind === 'remove') {
        await query('UPDATE feature_requests SET assignee_id = NULL, updated_at = NOW() WHERE organization_id = $1 AND assignee_id = $2', [orgId, targetId]);
        await query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [orgId, targetId]);
      } else {
        await query('UPDATE organization_users SET role = $3 WHERE organization_id = $1 AND user_id = $2', [orgId, targetId, change.role]);
      }
    }
    await logActivity({ organizationId: orgId, userId: actorId, action: 'MEMBER_UPDATED', entityType: 'ORGANIZATION', entityId: orgId,
      metadata: { targetUserId: targetId, previousRole, operation: change.kind, ...('role' in change ? { role: change.role } : {}) } });
  });
}
