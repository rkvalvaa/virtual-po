import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { ActivityLog, ActivityAction, ActivityEntityType } from '@/lib/types/database';

export async function logActivity(params: {
  organizationId: string;
  requestId?: string | null;
  userId?: string | null;
  action: ActivityAction;
  entityType?: ActivityEntityType | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ActivityLog> {
  const result = await query(
    `INSERT INTO activity_log (organization_id, request_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.organizationId,
      params.requestId ?? null,
      params.userId ?? null,
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      JSON.stringify(params.metadata ?? {}),
    ]
  );
  return mapRow<ActivityLog>(result.rows[0]);
}

export interface ActivityLogWithUser extends ActivityLog {
  userName: string | null;
}

export async function getActivityByRequest(
  requestId: string,
  limit = 50,
  offset = 0
): Promise<ActivityLogWithUser[]> {
  const result = await query(
    `SELECT al.*, u.name AS user_name
     FROM activity_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.request_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [requestId, limit, offset]
  );
  return mapRows<ActivityLogWithUser>(result.rows);
}

export async function getActivityByOrganization(
  organizationId: string,
  limit = 50,
  offset = 0
): Promise<ActivityLogWithUser[]> {
  const result = await query(
    `SELECT al.*, u.name AS user_name
     FROM activity_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.organization_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2 OFFSET $3`,
    [organizationId, limit, offset]
  );
  return mapRows<ActivityLogWithUser>(result.rows);
}
