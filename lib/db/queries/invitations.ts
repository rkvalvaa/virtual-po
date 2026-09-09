import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { query, transaction } from '@/lib/db/pool';
import { lockOrganizationAdmin } from '@/lib/auth/organization-admin';
import { logActivity } from './activity-log';
import { getOrganizationRole } from './organizations';
import type { UserRole } from '@/lib/types/database';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export interface PendingInvitation { id: string; email: string; role: UserRole; expiresAt: string; deliveryStatus: string; deliveryError: string | null }
export interface InvitationDelivery { id: string; token: string; email: string; organizationName: string; role: UserRole }

export async function listPendingInvitations(orgId: string): Promise<PendingInvitation[]> {
  const result = await query(`SELECT id, email, role, expires_at, delivery_status, delivery_error FROM organization_invitations
    WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC`, [orgId]);
  return result.rows.map(row => ({ id: row.id, email: row.email, role: row.role, expiresAt: row.expires_at.toISOString(), deliveryStatus: row.delivery_status, deliveryError: row.delivery_error }));
}

export async function createInvitation(orgId: string, actorId: string, email: string, role: UserRole): Promise<InvitationDelivery> {
  const recipient = z.email().parse(email.trim().toLowerCase());
  z.enum(['ADMIN', 'REVIEWER', 'STAKEHOLDER']).parse(role);
  return transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const existing = await query('SELECT id FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL', [orgId, recipient]);
    if (existing.rowCount) throw new Error('A pending invitation already exists. Resend or revoke it first.');
    const token = randomBytes(32).toString('hex');
    const result = await query(`INSERT INTO organization_invitations (organization_id, email, role, token_hash, expires_at, created_by)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days', $5) RETURNING id`, [orgId, recipient, role, hash(token), actorId]);
    const id = result.rows[0].id;
    await invitationAudit(orgId, actorId, id, 'created', recipient);
    return deliveryInfo(orgId, id, token, recipient, role);
  });
}

export async function resendInvitation(orgId: string, actorId: string, id: string): Promise<InvitationDelivery> {
  return transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const token = randomBytes(32).toString('hex');
    const result = await query(`UPDATE organization_invitations SET token_hash = $3, expires_at = NOW() + INTERVAL '7 days',
      delivery_status = 'PENDING', delivery_error = NULL, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING email, role`, [orgId, id, hash(token)]);
    if (!result.rowCount) throw new Error('Pending invitation not found.');
    await invitationAudit(orgId, actorId, id, 'resent', result.rows[0].email);
    return deliveryInfo(orgId, id, token, result.rows[0].email, result.rows[0].role);
  });
}

export async function revokeInvitation(orgId: string, actorId: string, id: string): Promise<void> {
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const result = await query(`UPDATE organization_invitations SET revoked_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING email`, [orgId, id]);
    if (!result.rowCount) throw new Error('Pending invitation not found.');
    await invitationAudit(orgId, actorId, id, 'revoked', result.rows[0].email);
  });
}

export async function recordInvitationDelivery(orgId: string, invite: InvitationDelivery, error?: string): Promise<void> {
  // A slow previous delivery must not overwrite the state of a newer resend.
  await query(`UPDATE organization_invitations SET delivery_status = $4, delivery_error = $5, updated_at = NOW()
    WHERE organization_id = $1 AND id = $2 AND token_hash = $3`, [orgId, invite.id, hash(invite.token), error ? 'FAILED' : 'SENT', error ?? null]);
}

export async function acceptInvitation(token: string, userId: string): Promise<{ orgId: string; name: string }> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid invitation.');
  return transaction(async () => {
    const located = await query('SELECT organization_id FROM organization_invitations WHERE token_hash = $1', [hash(token)]);
    if (!located.rowCount) throw new Error('Invitation not found. Ask an administrator for a new invitation.');
    const orgId = located.rows[0].organization_id;
    const organization = await query('SELECT name FROM organizations WHERE id = $1 FOR UPDATE', [orgId]);
    const result = await query('SELECT *, expires_at <= NOW() AS expired FROM organization_invitations WHERE token_hash = $1 FOR UPDATE', [hash(token)]);
    if (!result.rowCount) throw new Error('Invitation was replaced. Use the latest email.');
    const invite = result.rows[0];
    const user = await query('SELECT email FROM users WHERE id = $1', [userId]);
    if (!user.rowCount || user.rows[0].email.trim().toLowerCase() !== invite.email) throw new Error('Sign in with the account this invitation was sent to.');
    if (invite.revoked_at) throw new Error('Invitation revoked. Ask an administrator for a new invitation.');
    if (invite.accepted_at) {
      if (invite.accepted_by !== userId || !await getOrganizationRole(orgId, userId)) throw new Error('Invitation already used. Ask an administrator for a new invitation.');
      return { orgId, name: organization.rows[0].name };
    }
    if (invite.expired) throw new Error('Invitation expired. Ask an administrator to resend it.');
    await query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
      ON CONFLICT (organization_id, user_id) DO NOTHING`, [orgId, userId, invite.role]);
    await query('UPDATE organization_invitations SET accepted_at = NOW(), accepted_by = $2, updated_at = NOW() WHERE id = $1', [invite.id, userId]);
    await invitationAudit(orgId, userId, invite.id, 'accepted', invite.email);
    return { orgId, name: organization.rows[0].name };
  });
}

async function deliveryInfo(orgId: string, id: string, token: string, email: string, role: UserRole): Promise<InvitationDelivery> {
  const organization = await query('SELECT name FROM organizations WHERE id = $1', [orgId]);
  return { id, token, email, role, organizationName: organization.rows[0].name };
}
async function invitationAudit(orgId: string, actorId: string, id: string, operation: string, email: string) {
  await logActivity({ organizationId: orgId, userId: actorId, action: 'INVITATION_UPDATED', entityType: 'ORGANIZATION', entityId: orgId, metadata: { invitationId: id, operation, email } });
}
