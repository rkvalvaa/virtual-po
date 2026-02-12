import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type {
  GitHubSyncLog,
  GitHubSyncDirection,
  GitHubSyncStatus,
  GitHubSyncEntityType,
} from '@/lib/types/database';

// Reuse generic integration functions from jira-sync
export {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
} from '@/lib/db/queries/jira-sync';

export async function logGitHubSync(
  orgId: string,
  entityType: GitHubSyncEntityType,
  entityId: string,
  issueNumber: number | null,
  direction: GitHubSyncDirection,
  status: GitHubSyncStatus,
  error?: string
): Promise<GitHubSyncLog> {
  const result = await query(
    `INSERT INTO github_sync_log (organization_id, entity_type, entity_id, github_issue_number, sync_direction, sync_status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [orgId, entityType, entityId, issueNumber, direction, status, error ?? null]
  );
  return mapRow<GitHubSyncLog>(result.rows[0]);
}

export async function getGitHubSyncHistory(
  orgId: string,
  limit = 20
): Promise<GitHubSyncLog[]> {
  const result = await query(
    `SELECT * FROM github_sync_log
     WHERE organization_id = $1
     ORDER BY synced_at DESC
     LIMIT $2`,
    [orgId, limit]
  );
  return mapRows<GitHubSyncLog>(result.rows);
}

export async function updateFeatureRequestGitHubKeys(
  requestId: string,
  issueNumber: number,
  issueUrl: string
): Promise<void> {
  await query(
    `UPDATE feature_requests
     SET github_issue_number = $1, github_issue_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [issueNumber, issueUrl, requestId]
  );
}

export async function updateEpicGitHubKeys(
  epicId: string,
  issueNumber: number,
  issueUrl: string
): Promise<void> {
  await query(
    `UPDATE epics
     SET github_issue_number = $1, github_issue_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [issueNumber, issueUrl, epicId]
  );
}

export async function updateStoryGitHubKeys(
  storyId: string,
  issueNumber: number,
  issueUrl: string
): Promise<void> {
  await query(
    `UPDATE user_stories
     SET github_issue_number = $1, github_issue_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [issueNumber, issueUrl, storyId]
  );
}
