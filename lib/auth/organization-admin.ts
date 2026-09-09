import { query } from '@/lib/db/pool';

/** Call inside transaction(). Serializes administration, including last-admin checks. */
export async function lockOrganizationAdmin(orgId: string, userId: string): Promise<void> {
  await query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [orgId]);
  const member = await query(`SELECT user_id FROM organization_users
    WHERE organization_id = $1 AND user_id = $2 AND role = 'ADMIN' FOR UPDATE`, [orgId, userId]);
  if (!member.rowCount) throw new Error('Current administrator access is required.');
}
