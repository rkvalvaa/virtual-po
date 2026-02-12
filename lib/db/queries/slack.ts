import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { SlackNotification, SlackEventType } from '@/lib/types/database';

export async function getSlackNotifications(orgId: string): Promise<SlackNotification[]> {
  const result = await query(
    `SELECT * FROM slack_notifications WHERE organization_id = $1 ORDER BY event_type, channel_name`,
    [orgId]
  );
  return mapRows<SlackNotification>(result.rows);
}

export async function upsertSlackNotification(
  orgId: string,
  channelId: string,
  channelName: string,
  eventType: SlackEventType
): Promise<SlackNotification> {
  const result = await query(
    `INSERT INTO slack_notifications (organization_id, channel_id, channel_name, event_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, channel_id, event_type)
     DO UPDATE SET channel_name = EXCLUDED.channel_name, is_active = true
     RETURNING *`,
    [orgId, channelId, channelName, eventType]
  );
  return mapRow<SlackNotification>(result.rows[0]);
}

export async function deleteSlackNotification(id: string): Promise<void> {
  await query(`DELETE FROM slack_notifications WHERE id = $1`, [id]);
}

export async function getNotificationsByEventType(
  orgId: string,
  eventType: SlackEventType
): Promise<SlackNotification[]> {
  const result = await query(
    `SELECT * FROM slack_notifications WHERE organization_id = $1 AND event_type = $2 AND is_active = true`,
    [orgId, eventType]
  );
  return mapRows<SlackNotification>(result.rows);
}
