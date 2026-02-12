import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Notification, NotificationType } from '@/lib/types/database';
import { getUserEmailForNotification } from '@/lib/db/queries/email-preferences';
import { sendNotificationEmail } from '@/lib/email/send';

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
  limit = 20,
  offset = 0
): Promise<Notification[]> {
  const result = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return mapRows<Notification>(result.rows);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return result.rows[0].count;
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  await query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  await query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
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
  await createNotification(params);

  // Send email if user has email enabled for this notification type
  const emailInfo = await getUserEmailForNotification(
    params.userId,
    params.organizationId,
    params.type
  );
  if (emailInfo) {
    sendNotificationEmail({
      to: emailInfo.email,
      recipientName: emailInfo.name,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    }).catch(() => {
      // fire-and-forget, errors already logged inside sendNotificationEmail
    });
  }
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
  await notifyUser({
    organizationId: params.organizationId,
    userId: params.requesterId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
    requestId: params.requestId,
    actorId: params.actorId,
  });
}
