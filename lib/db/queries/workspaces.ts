import { query } from '@/lib/db/pool';
import type { UserRole } from '@/lib/types/database';

export interface UserWorkspace {
  id: string;
  name: string;
  role: UserRole;
}

export async function rememberWorkspace(userId: string, orgId: string): Promise<boolean> {
  const result = await query(
    `UPDATE users
     SET preferred_organization_id = $2, updated_at = NOW()
     WHERE id = $1
       AND EXISTS (
         SELECT 1 FROM organization_users
         WHERE user_id = $1 AND organization_id = $2
       )
     RETURNING id`,
    [userId, orgId],
  );
  return result.rowCount === 1;
}

export async function getPreferredWorkspace(
  userId: string,
): Promise<{ orgId: string; role: UserRole } | null> {
  const result = await query<{ organization_id: string; role: UserRole }>(
    `SELECT ou.organization_id, ou.role
     FROM users u
     JOIN organization_users ou ON ou.user_id = u.id
     WHERE u.id = $1
     ORDER BY
       CASE WHEN ou.organization_id = u.preferred_organization_id THEN 0 ELSE 1 END,
       ou.created_at,
       ou.organization_id
     LIMIT 1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  return {
    orgId: result.rows[0].organization_id,
    role: result.rows[0].role,
  };
}

export async function listUserWorkspaces(userId: string): Promise<UserWorkspace[]> {
  const result = await query<{ id: string; name: string; role: UserRole }>(
    `SELECT o.id, o.name, ou.role
     FROM organization_users ou
     JOIN organizations o ON o.id = ou.organization_id
     WHERE ou.user_id = $1
     ORDER BY LOWER(o.name), o.id`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
  }));
}
