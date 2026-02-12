import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { ApiKey, ApiKeyScope } from '@/lib/types/database';

export async function createApiKey(
  orgId: string,
  name: string,
  keyHash: string,
  keyPrefix: string,
  scopes: ApiKeyScope[],
  createdBy: string,
  expiresAt?: Date
): Promise<ApiKey> {
  const result = await query(
    `INSERT INTO api_keys (organization_id, name, key_hash, key_prefix, scopes, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [orgId, name, keyHash, keyPrefix, scopes, createdBy, expiresAt ?? null]
  );
  return mapRow<ApiKey>(result.rows[0]);
}

export async function getApiKeysByOrg(orgId: string): Promise<ApiKey[]> {
  const result = await query(
    `SELECT * FROM api_keys
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [orgId]
  );
  return mapRows<ApiKey>(result.rows);
}

export async function getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const result = await query(
    `SELECT * FROM api_keys WHERE key_hash = $1 LIMIT 1`,
    [keyHash]
  );
  if (result.rows.length === 0) return null;
  return mapRow<ApiKey>(result.rows[0]);
}

export async function revokeApiKey(id: string): Promise<void> {
  await query(
    `UPDATE api_keys SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function updateApiKeyLastUsed(id: string): Promise<void> {
  await query(
    `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
    [id]
  );
}
