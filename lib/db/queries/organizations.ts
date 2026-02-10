import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type {
  Organization,
  OrganizationUser,
  User,
  UserRole,
} from '@/lib/types/database';

export async function createOrganization(
  name: string,
  slug: string,
  settings: Record<string, unknown> = {}
): Promise<Organization> {
  const result = await query(
    `INSERT INTO organizations (name, slug, settings)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, slug, JSON.stringify(settings)]
  );
  return mapRow<Organization>(result.rows[0]);
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const result = await query(
    `SELECT * FROM organizations WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapRow<Organization>(result.rows[0]);
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const result = await query(
    `SELECT * FROM organizations WHERE slug = $1`,
    [slug]
  );
  if (result.rows.length === 0) return null;
  return mapRow<Organization>(result.rows[0]);
}

export async function updateOrganization(
  id: string,
  data: Partial<Pick<Organization, 'name' | 'settings'>>
): Promise<Organization> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.settings !== undefined) {
    fields.push(`settings = $${paramIndex++}`);
    values.push(JSON.stringify(data.settings));
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<Organization>(result.rows[0]);
}

export async function addUserToOrganization(
  orgId: string,
  userId: string,
  role: UserRole
): Promise<OrganizationUser> {
  const result = await query(
    `INSERT INTO organization_users (organization_id, user_id, role)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [orgId, userId, role]
  );
  return mapRow<OrganizationUser>(result.rows[0]);
}

export async function getOrganizationUsers(
  orgId: string
): Promise<(OrganizationUser & { user: User })[]> {
  const result = await query(
    `SELECT ou.*,
            u.id AS user__id,
            u.email AS user__email,
            u.name AS user__name,
            u.avatar_url AS user__avatar_url,
            u.created_at AS user__created_at,
            u.updated_at AS user__updated_at
     FROM organization_users ou
     JOIN users u ON u.id = ou.user_id
     WHERE ou.organization_id = $1
     ORDER BY ou.created_at`,
    [orgId]
  );

  return result.rows.map((row) => {
    const ou = mapRow<OrganizationUser>(row);
    const user: User = {
      id: row.user__id,
      email: row.user__email,
      name: row.user__name,
      avatarUrl: row.user__avatar_url,
      createdAt: row.user__created_at,
      updatedAt: row.user__updated_at,
    };
    return { ...ou, user };
  });
}

export async function getUserOrganizations(userId: string): Promise<Organization[]> {
  const result = await query(
    `SELECT o.*
     FROM organizations o
     JOIN organization_users ou ON ou.organization_id = o.id
     WHERE ou.user_id = $1
     ORDER BY o.name`,
    [userId]
  );
  return mapRows<Organization>(result.rows);
}
