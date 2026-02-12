import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type {
  Integration,
  JiraSyncLog,
  JiraSyncDirection,
  JiraSyncStatus,
  JiraSyncEntityType,
} from '@/lib/types/database';

export async function getIntegrationByType(
  orgId: string,
  type: string
): Promise<Integration | null> {
  const result = await query(
    `SELECT * FROM integrations
     WHERE organization_id = $1 AND type = $2 AND is_active = true
     LIMIT 1`,
    [orgId, type]
  );
  if (result.rows.length === 0) return null;
  return mapRow<Integration>(result.rows[0]);
}

export async function upsertIntegration(
  orgId: string,
  type: string,
  name: string,
  config: Record<string, unknown>
): Promise<Integration> {
  const result = await query(
    `INSERT INTO integrations (organization_id, type, name, config)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, type) WHERE is_active = true
     DO UPDATE SET name = EXCLUDED.name, config = EXCLUDED.config, is_active = true, updated_at = NOW()
     RETURNING *`,
    [orgId, type, name, JSON.stringify(config)]
  );
  return mapRow<Integration>(result.rows[0]);
}

export async function deactivateIntegration(id: string): Promise<void> {
  await query(
    `UPDATE integrations
     SET is_active = false, updated_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

export async function logJiraSync(
  orgId: string,
  entityType: JiraSyncEntityType,
  entityId: string,
  jiraKey: string,
  direction: JiraSyncDirection,
  status: JiraSyncStatus,
  error?: string
): Promise<JiraSyncLog> {
  const result = await query(
    `INSERT INTO jira_sync_log (organization_id, entity_type, entity_id, jira_key, sync_direction, sync_status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [orgId, entityType, entityId, jiraKey, direction, status, error ?? null]
  );
  return mapRow<JiraSyncLog>(result.rows[0]);
}

export async function getJiraSyncHistory(
  orgId: string,
  limit = 20
): Promise<JiraSyncLog[]> {
  const result = await query(
    `SELECT * FROM jira_sync_log
     WHERE organization_id = $1
     ORDER BY synced_at DESC
     LIMIT $2`,
    [orgId, limit]
  );
  return mapRows<JiraSyncLog>(result.rows);
}

export async function updateFeatureRequestJiraKeys(
  requestId: string,
  jiraKey: string,
  jiraUrl: string
): Promise<void> {
  await query(
    `UPDATE feature_requests
     SET jira_issue_key = $1, jira_issue_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [jiraKey, jiraUrl, requestId]
  );
}

export async function updateEpicJiraKeys(
  epicId: string,
  jiraKey: string,
  jiraUrl: string
): Promise<void> {
  await query(
    `UPDATE epics
     SET jira_epic_key = $1, jira_epic_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [jiraKey, jiraUrl, epicId]
  );
}

export async function updateStoryJiraKeys(
  storyId: string,
  jiraKey: string,
  jiraUrl: string
): Promise<void> {
  await query(
    `UPDATE user_stories
     SET jira_story_key = $1, jira_story_url = $2, updated_at = NOW()
     WHERE id = $3`,
    [jiraKey, jiraUrl, storyId]
  );
}
