import { query, transaction } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Notification, NotificationType } from '@/lib/types/database';
import { getUserEmailForNotification } from '@/lib/db/queries/email-preferences';
import { enqueueNotificationEmail } from '@/lib/email/outbox';
import { listRequestEventNotificationRecipients } from '@/lib/db/queries/collaboration';

export async function createNotification(params: {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  requestId?: string;
  actorId?: string;
}): Promise<Notification> {
  const result = await query(
    `INSERT INTO notifications (organization_id, user_id, type, title, message, link, request_id, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      params.organizationId,
      params.userId,
      params.type,
      params.title,
      params.message,
      params.link ?? null,
      params.requestId ?? null,
      params.actorId ?? null,
    ]
  );
  return mapRow<Notification>(result.rows[0]);
}

export async function getNotificationsByUser(
  userId: string,
  orgId: string,
  limit = 20,
  offset = 0
): Promise<Notification[]> {
  const result = await query(
    `SELECT n.* FROM notifications n
     WHERE n.user_id = $1
       AND n.organization_id = $2
       AND EXISTS (
         SELECT 1 FROM organization_users ou
         WHERE ou.user_id = $1 AND ou.organization_id = $2
       )
     ORDER BY n.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, orgId, limit, offset]
  );
  return mapRows<Notification>(result.rows);
}

export async function getUnreadCount(userId: string, orgId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM notifications n
     WHERE n.user_id = $1
       AND n.organization_id = $2
       AND n.is_read = false
       AND EXISTS (
         SELECT 1 FROM organization_users ou
         WHERE ou.user_id = $1 AND ou.organization_id = $2
       )`,
    [userId, orgId]
  );
  return result.rows[0].count;
}

export async function markAsRead(
  notificationId: string,
  userId: string,
  orgId: string,
): Promise<void> {
  await query(
    `UPDATE notifications n
     SET is_read = true
     WHERE n.id = $1
       AND n.user_id = $2
       AND n.organization_id = $3
       AND EXISTS (
         SELECT 1 FROM organization_users ou
         WHERE ou.user_id = $2 AND ou.organization_id = $3
       )`,
    [notificationId, userId, orgId]
  );
}

export async function markAllAsRead(userId: string, orgId: string): Promise<void> {
  await query(
    `UPDATE notifications n
     SET is_read = true
     WHERE n.user_id = $1
       AND n.organization_id = $2
       AND n.is_read = false
       AND EXISTS (
         SELECT 1 FROM organization_users ou
         WHERE ou.user_id = $1 AND ou.organization_id = $2
       )`,
    [userId, orgId]
  );
}

export async function getOrgUserIds(
  orgId: string,
  excludeUserId?: string
): Promise<string[]> {
  const result = excludeUserId
    ? await query(
        `SELECT user_id FROM organization_users WHERE organization_id = $1 AND user_id != $2`,
        [orgId, excludeUserId]
      )
    : await query(
        `SELECT user_id FROM organization_users WHERE organization_id = $1`,
        [orgId]
      );
  return result.rows.map((r: Record<string, unknown>) => r.user_id as string);
}

export async function notifyUser(params: {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  requestId?: string;
  actorId?: string;
}): Promise<void> {
  // Don't notify the actor about their own action
  if (params.actorId && params.userId === params.actorId) return;
  await transaction(async () => {
    const notification = await createNotification(params);
    const emailInfo = await getUserEmailForNotification(
      params.userId,
      params.organizationId,
      params.type
    );
    if (emailInfo) {
      await enqueueNotificationEmail({
        organizationId: params.organizationId,
        notificationId: notification.id,
        recipientUserId: params.userId,
        recipientEmail: emailInfo.email,
        recipientName: emailInfo.name,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
      });
    }
  });
}

export async function notifyRequestOwner(params: {
  organizationId: string;
  requesterId: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  requestId: string;
  actorId: string;
}): Promise<void> {
  await transaction(async () => {
    const includeSubscribers = params.type === 'STATUS_CHANGED' || params.type === 'DECISION_MADE';
    const recipients = await listRequestEventNotificationRecipients(
      params.requestId,
      params.organizationId,
      params.actorId,
      includeSubscribers,
    );
    for (const userId of recipients) {
      await notifyUser({
        organizationId: params.organizationId,
        userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
        requestId: params.requestId,
        actorId: params.actorId,
      });
    }
  });
}
