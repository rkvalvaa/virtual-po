import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { TeamsNotification, TeamsEventType } from '@/lib/types/database';

export async function getTeamsNotifications(orgId: string): Promise<TeamsNotification[]> {
  const result = await query(
    `SELECT * FROM teams_notifications WHERE organization_id = $1 AND is_active = true ORDER BY event_type, channel_name`,
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

export async function deleteTeamsNotification(id: string, orgId: string): Promise<boolean> {
  const result = await query(`UPDATE teams_notifications SET is_active=false WHERE id = $1 AND organization_id = $2 AND is_active=true RETURNING id`, [id, orgId]);
  return result.rows.length > 0;
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

export async function upsertTeamsTenant(orgId: string, tenantId: string): Promise<void> {
  await query(`INSERT INTO teams_tenants(organization_id,tenant_id) VALUES($1,$2)
    ON CONFLICT(organization_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,updated_at=clock_timestamp()`, [orgId, tenantId])
}

export async function bindTeamsIdentity(orgId: string, tenantId: string, teamsUserId: string, userId: string): Promise<boolean> {
  const result = await query(`INSERT INTO teams_identity_bindings(organization_id,tenant_id,teams_user_id,user_id)
    SELECT $1,$2,$3,ou.user_id FROM organization_users ou JOIN teams_tenants t ON t.organization_id=ou.organization_id AND t.tenant_id=$2
    WHERE ou.organization_id=$1 AND ou.user_id=$4
    ON CONFLICT(organization_id,user_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,teams_user_id=EXCLUDED.teams_user_id RETURNING user_id`, [orgId, tenantId, teamsUserId, userId])
  return Boolean(result.rowCount)
}

export async function getTeamsTenant(orgId: string): Promise<string | null> {
  const result = await query('SELECT tenant_id FROM teams_tenants WHERE organization_id=$1', [orgId])
  return result.rows[0]?.tenant_id ?? null
}
