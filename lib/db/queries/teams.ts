import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { TeamsNotification, TeamsEventType } from '@/lib/types/database';

export async function getTeamsNotifications(orgId: string): Promise<TeamsNotification[]> {
  const result = await query(
    `SELECT * FROM teams_notifications WHERE organization_id = $1 ORDER BY event_type, channel_name`,
    [orgId]
  );
  return mapRows<TeamsNotification>(result.rows);
}

export async function upsertTeamsNotification(
  orgId: string,
  channelName: string,
  webhookUrl: string,
  eventType: TeamsEventType
): Promise<TeamsNotification> {
  const result = await query(
    `INSERT INTO teams_notifications (organization_id, channel_name, webhook_url, event_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, webhook_url, event_type)
     DO UPDATE SET channel_name = EXCLUDED.channel_name, is_active = true
     RETURNING *`,
    [orgId, channelName, webhookUrl, eventType]
  );
  return mapRow<TeamsNotification>(result.rows[0]);
}

export async function deleteTeamsNotification(id: string): Promise<void> {
  await query(`DELETE FROM teams_notifications WHERE id = $1`, [id]);
}

export async function getTeamsNotificationsByEventType(
  orgId: string,
  eventType: TeamsEventType
): Promise<TeamsNotification[]> {
  const result = await query(
    `SELECT * FROM teams_notifications WHERE organization_id = $1 AND event_type = $2 AND is_active = true`,
    [orgId, eventType]
  );
  return mapRows<TeamsNotification>(result.rows);
}
