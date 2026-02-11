import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Repository } from '@/lib/types/database';

export async function connectRepository(
  orgId: string,
  githubRepoId: number,
  owner: string,
  name: string,
  fullName: string,
  defaultBranch: string,
  connectedBy: string
): Promise<Repository> {
  const result = await query(
    `INSERT INTO repositories (organization_id, github_repo_id, owner, name, full_name, default_branch, connected_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (organization_id, github_repo_id)
     DO UPDATE SET is_active = true, updated_at = NOW()
     RETURNING *`,
    [orgId, githubRepoId, owner, name, fullName, defaultBranch, connectedBy]
  );
  return mapRow<Repository>(result.rows[0]);
}

export async function disconnectRepository(
  repoId: string,
  orgId: string
): Promise<void> {
  await query(
    `UPDATE repositories
     SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [repoId, orgId]
  );
}

export async function getRepositoriesByOrgId(
  orgId: string
): Promise<Repository[]> {
  const result = await query(
    `SELECT * FROM repositories
     WHERE organization_id = $1 AND is_active = true
     ORDER BY name`,
    [orgId]
  );
  return mapRows<Repository>(result.rows);
}

export async function getRepositoryById(
  repoId: string
): Promise<Repository | null> {
  const result = await query(
    `SELECT * FROM repositories
     WHERE id = $1
     LIMIT 1`,
    [repoId]
  );
  if (result.rows.length === 0) return null;
  return mapRow<Repository>(result.rows[0]);
}

export async function getActiveRepositoriesForOrg(
  orgId: string
): Promise<Repository[]> {
  return getRepositoriesByOrgId(orgId);
}
