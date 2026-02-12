import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type {
  LinearSyncLog,
  JiraSyncDirection,
  JiraSyncStatus,
  JiraSyncEntityType,
} from '@/lib/types/database';

export async function logLinearSync(
  orgId: string,
  entityType: JiraSyncEntityType,
  entityId: string,
  linearId: string,
  direction: JiraSyncDirection,
  status: JiraSyncStatus,
  error?: string
): Promise<LinearSyncLog> {
  const result = await query(
    `INSERT INTO linear_sync_log (organization_id, entity_type, entity_id, linear_id, sync_direction, sync_status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [orgId, entityType, entityId, linearId, direction, status, error ?? null]
  );
  return mapRow<LinearSyncLog>(result.rows[0]);
}

export async function getLinearSyncHistory(
  orgId: string,
  limit = 20
): Promise<LinearSyncLog[]> {
  const result = await query(
    `SELECT * FROM linear_sync_log
     WHERE organization_id = $1
     ORDER BY synced_at DESC
     LIMIT $2`,
    [orgId, limit]
  );
  return mapRows<LinearSyncLog>(result.rows);
}

export async function updateFeatureRequestLinearKeys(
  requestId: string,
  linearId: string,
  linearUrl: string
): Promise<void> {
  await query(
    `UPDATE feature_requests
     SET linear_issue_id = $1, linear_issue_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [linearId, linearUrl, requestId]
  );
}

export async function updateEpicLinearKeys(
  epicId: string,
  linearProjectId: string,
  linearProjectUrl: string
): Promise<void> {
  await query(
    `UPDATE epics
     SET linear_project_id = $1, linear_project_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [linearProjectId, linearProjectUrl, epicId]
  );
}

export async function updateStoryLinearKeys(
  storyId: string,
  linearId: string,
  linearUrl: string
): Promise<void> {
  await query(
    `UPDATE user_stories
     SET linear_issue_id = $1, linear_issue_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [linearId, linearUrl, storyId]
  );
}
