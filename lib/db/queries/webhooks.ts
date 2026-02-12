import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { WebhookSubscription, WebhookEvent } from '@/lib/types/database';

export async function createWebhookSubscription(
  orgId: string,
  url: string,
  secret: string,
  events: WebhookEvent[]
): Promise<WebhookSubscription> {
  const result = await query(
    `INSERT INTO webhook_subscriptions (organization_id, url, secret, events)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [orgId, url, secret, events]
  );
  return mapRow<WebhookSubscription>(result.rows[0]);
}

export async function getWebhooksByOrg(orgId: string): Promise<WebhookSubscription[]> {
  const result = await query(
    `SELECT * FROM webhook_subscriptions
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [orgId]
  );
  return mapRows<WebhookSubscription>(result.rows);
}

export async function getWebhooksByEvent(
  orgId: string,
  event: WebhookEvent
): Promise<WebhookSubscription[]> {
  const result = await query(
    `SELECT * FROM webhook_subscriptions
     WHERE organization_id = $1 AND is_active = true AND $2 = ANY(events)`,
    [orgId, event]
  );
  return mapRows<WebhookSubscription>(result.rows);
}

export async function updateWebhookSubscription(
  id: string,
  data: { url?: string; events?: WebhookEvent[]; isActive?: boolean }
): Promise<WebhookSubscription> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.url !== undefined) {
    fields.push(`url = $${paramIndex++}`);
    values.push(data.url);
  }
  if (data.events !== undefined) {
    fields.push(`events = $${paramIndex++}`);
    values.push(data.events);
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }

  if (fields.length === 0) {
    const existing = await query(`SELECT * FROM webhook_subscriptions WHERE id = $1`, [id]);
    return mapRow<WebhookSubscription>(existing.rows[0]);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE webhook_subscriptions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<WebhookSubscription>(result.rows[0]);
}

export async function deleteWebhookSubscription(id: string): Promise<void> {
  await query(`DELETE FROM webhook_subscriptions WHERE id = $1`, [id]);
}

export async function incrementWebhookFailure(id: string): Promise<void> {
  await query(
    `UPDATE webhook_subscriptions
     SET failure_count = failure_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

export async function resetWebhookFailure(id: string): Promise<void> {
  await query(
    `UPDATE webhook_subscriptions
     SET failure_count = 0, last_triggered_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id]
  );
}
