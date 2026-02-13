import { query } from '@/lib/db/pool';
import { mapRows } from '@/lib/db/mappers';
import type { EmailPreference, NotificationType } from '@/lib/types/database';

export async function getEmailPreferences(
  userId: string,
  orgId: string
): Promise<EmailPreference[]> {
  const result = await query(
    `SELECT * FROM email_preferences
     WHERE user_id = $1 AND organization_id = $2`,
    [userId, orgId]
  );
  return mapRows<EmailPreference>(result.rows);
}

export async function isEmailEnabled(
  userId: string,
  orgId: string,
  notificationType: NotificationType
): Promise<boolean> {
  const result = await query(
    `SELECT email_enabled FROM email_preferences
     WHERE user_id = $1 AND organization_id = $2 AND notification_type = $3`,
    [userId, orgId, notificationType]
  );
  // Default to true if no preference set
  if (result.rows.length === 0) return true;
  return result.rows[0].email_enabled;
}

export async function upsertEmailPreference(
  userId: string,
  orgId: string,
  notificationType: NotificationType,
  emailEnabled: boolean
): Promise<void> {
  await query(
    `INSERT INTO email_preferences (user_id, organization_id, notification_type, email_enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, organization_id, notification_type)
     DO UPDATE SET email_enabled = $4`,
    [userId, orgId, notificationType, emailEnabled]
  );
}

export async function getUserEmailForNotification(
  userId: string,
  orgId: string,
  notificationType: NotificationType
): Promise<{ email: string; name: string | null } | null> {
  const enabled = await isEmailEnabled(userId, orgId, notificationType);
  if (!enabled) return null;

  const result = await query(
    `SELECT email, name FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return { email: result.rows[0].email, name: result.rows[0].name };
}
