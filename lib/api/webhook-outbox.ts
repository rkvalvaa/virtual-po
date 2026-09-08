import { createHmac, randomUUID } from 'node:crypto';
import { query, transaction } from '@/lib/db/pool';
import { log } from '@/lib/logging/logger';
import { InvalidWebhookDestination } from './webhook-destination';
import { postWebhook } from './webhook-http';

const MAX_ATTEMPTS = 5;
type Scope = { orgId?: string; deliveryId?: string; limit?: number };
export interface ClaimedWebhook { id: string; leaseToken: string }

export async function claimWebhookDeliveries(scope: Scope = {}): Promise<ClaimedWebhook[]> {
  return transaction(async () => {
    const params = [scope.orgId ?? null, scope.deliveryId ?? null];
    const expired = await query(`SELECT d.id FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id
      WHERE d.status='RUNNING' AND d.lease_expires_at <= clock_timestamp()
      AND ($1::uuid IS NULL OR e.organization_id=$1) AND ($2::uuid IS NULL OR d.id=$2)
      LIMIT 100 FOR UPDATE OF d SKIP LOCKED`, params);
    const ids = expired.rows.map(row => row.id);
    if (ids.length) {
      await query(`UPDATE webhook_delivery_attempts SET outcome='INTERRUPTED', error_code='LEASE_EXPIRED', finished_at=clock_timestamp()
        WHERE delivery_id=ANY($1::uuid[]) AND outcome='RUNNING'`, [ids]);
      await query(`UPDATE webhook_deliveries SET status=CASE WHEN retry_count >= $2 THEN 'FAILED' ELSE 'PENDING' END,
        error_code='LEASE_EXPIRED', lease_token=NULL, lease_expires_at=NULL, next_attempt_at=clock_timestamp(),
        finished_at=CASE WHEN retry_count >= $2 THEN clock_timestamp() ELSE NULL END WHERE id=ANY($1::uuid[])`, [ids, MAX_ATTEMPTS]);
    }
    const claimed = await query(`WITH candidate AS (
      SELECT d.id FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id
      JOIN webhook_subscriptions s ON s.id=d.subscription_id
      WHERE d.status='PENDING' AND d.next_attempt_at <= clock_timestamp() AND d.retry_count < $4
      AND (s.is_active OR d.is_test) AND ($1::uuid IS NULL OR e.organization_id=$1) AND ($2::uuid IS NULL OR d.id=$2)
      ORDER BY d.next_attempt_at, d.id LIMIT $3 FOR UPDATE OF d SKIP LOCKED
    ) UPDATE webhook_deliveries d SET status='RUNNING', attempt_count=attempt_count+1, retry_count=retry_count+1,
      lease_token=gen_random_uuid(), lease_expires_at=clock_timestamp()+interval '60 seconds'
      FROM candidate c WHERE d.id=c.id RETURNING d.id, d.lease_token, d.attempt_count`,
      [...params, Math.max(1, Math.min(scope.limit ?? 10, 20)), MAX_ATTEMPTS]);
    for (const row of claimed.rows) {
      await query(`INSERT INTO webhook_delivery_attempts(delivery_id,attempt_number,lease_token) VALUES($1,$2,$3)`, [row.id, row.attempt_count, row.lease_token]);
    }
    return claimed.rows.map(row => ({ id: row.id, leaseToken: row.lease_token }));
  });
}

export async function deliverClaimedWebhook(claim: ClaimedWebhook): Promise<void> {
  const current = await query(`SELECT d.*, e.body, e.organization_id, e.event_type, s.url, s.secret, s.is_active
    FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id JOIN webhook_subscriptions s ON s.id=d.subscription_id
    WHERE d.id=$1 AND d.lease_token=$2 AND d.status='RUNNING' AND d.lease_expires_at > clock_timestamp()`, [claim.id, claim.leaseToken]);
  const delivery = current.rows[0];
  if (!delivery) return;
  let status: number | null = null;
  let error: string | null = null;
  if (!delivery.is_active && !delivery.is_test) error = 'SUBSCRIPTION_PAUSED';
  else {
    try {
      status = await postWebhook(delivery.url, delivery.body, {
        'Content-Type': 'application/json', 'User-Agent': 'VirtualPO-Webhook/1.0',
        'X-Webhook-Id': delivery.event_id, 'X-Webhook-Delivery-Id': delivery.id,
        'X-Webhook-Signature': createHmac('sha256', delivery.secret).update(delivery.body).digest('hex'),
      });
      if (status < 200 || status >= 300) error = 'HTTP_ERROR';
    } catch (failure) { error = failure instanceof InvalidWebhookDestination ? 'DESTINATION_REJECTED' : 'NETWORK_ERROR'; }
  }
  const transient = error === 'NETWORK_ERROR' || error === 'SUBSCRIPTION_PAUSED' || status === 408 || status === 429 || (status !== null && status >= 500);
  const retry = Boolean(error && transient && delivery.retry_count < MAX_ATTEMPTS);
  const recorded = await transaction(async () => {
    const updated = await query(`UPDATE webhook_deliveries SET status=$3, http_status=$4, error_code=$5,
      lease_token=NULL, lease_expires_at=NULL, next_attempt_at=clock_timestamp()+($6 * interval '1 second'),
      finished_at=CASE WHEN $3='PENDING' THEN NULL ELSE clock_timestamp() END
      WHERE id=$1 AND lease_token=$2 AND status='RUNNING' RETURNING id`,
      [claim.id, claim.leaseToken, error ? retry ? 'PENDING' : 'FAILED' : 'SUCCEEDED', status, error, 60 * 2 ** (delivery.retry_count - 1)]);
    if (!updated.rows.length) return false; // A newer lease owns the result after interruption.
    await query(`UPDATE webhook_delivery_attempts SET outcome=$2, http_status=$3, error_code=$4, finished_at=clock_timestamp()
      WHERE lease_token=$1`, [claim.leaseToken, error ? 'FAILED' : 'SUCCEEDED', status, error]);
    await query(`UPDATE webhook_subscriptions SET failure_count=CASE WHEN $2 THEN failure_count+1 ELSE 0 END,
      last_triggered_at=CASE WHEN $2 THEN last_triggered_at ELSE clock_timestamp() END WHERE id=$1`, [delivery.subscription_id, Boolean(error)]);
    return true;
  });
  if (!recorded) return;
  log.info('webhook.delivery', { deliveryId: claim.id, orgId: delivery.organization_id,
    attempt: delivery.attempt_count, status, errorCode: error, retry });
}

export async function processWebhookOutbox(scope: Scope = {}): Promise<{ processed: number }> {
  const claims = await claimWebhookDeliveries(scope);
  await Promise.all(claims.map(deliverClaimedWebhook));
  return { processed: claims.length };
}

export async function enqueueWebhookTest(orgId: string, subscriptionId: string): Promise<string> {
  return transaction(async () => {
    const subscription = await query('SELECT id FROM webhook_subscriptions WHERE id=$1 AND organization_id=$2 FOR SHARE', [subscriptionId, orgId]);
    if (!subscription.rows.length) throw new Error('Webhook not found');
    const eventId = randomUUID();
    const body = JSON.stringify({ id: eventId, event: 'webhook.test', payload: { test: true, message: 'This is a test webhook delivery' }, timestamp: new Date().toISOString() });
    await query('INSERT INTO webhook_events(id,organization_id,event_type,body) VALUES($1,$2,$3,$4)', [eventId, orgId, 'webhook.test', body]);
    const result = await query('INSERT INTO webhook_deliveries(event_id,subscription_id,is_test) VALUES($1,$2,true) RETURNING id', [eventId, subscriptionId]);
    return result.rows[0].id;
  });
}

export async function listWebhookDeliveries(orgId: string, subscriptionId: string) {
  const result = await query(`SELECT d.id, d.status, d.attempt_count, d.next_attempt_at, d.http_status, d.error_code,
    d.created_at, e.event_type, e.id AS event_id,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('attempt',a.attempt_number,'outcome',a.outcome,'httpStatus',a.http_status,'errorCode',a.error_code) ORDER BY a.attempt_number), '[]')
      FROM webhook_delivery_attempts a WHERE a.delivery_id=d.id) AS attempts
    FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id
    WHERE e.organization_id=$1 AND d.subscription_id=$2 ORDER BY d.created_at DESC LIMIT 30`, [orgId, subscriptionId]);
  return result.rows.map(row => ({ id: row.id as string, status: row.status as string, attemptCount: row.attempt_count as number,
    nextAttemptAt: row.next_attempt_at.toISOString() as string, httpStatus: row.http_status as number | null,
    errorCode: row.error_code as string | null, createdAt: row.created_at.toISOString() as string,
    event: row.event_type as string, eventId: row.event_id as string,
    attempts: row.attempts as { attempt: number; outcome: string; httpStatus: number | null; errorCode: string | null }[] }));
}

export async function redeliverWebhook(orgId: string, deliveryId: string): Promise<boolean> {
  return transaction(async () => {
    const eligible = await query(`SELECT d.id FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id
      WHERE e.organization_id=$1 AND d.id=$2 AND (d.status = 'FAILED' OR (d.status='RUNNING' AND d.lease_expires_at <= clock_timestamp()))
      FOR UPDATE OF d`, [orgId, deliveryId]);
    if (!eligible.rows.length) return false;
    await query(`UPDATE webhook_delivery_attempts SET outcome='INTERRUPTED',error_code='LEASE_EXPIRED',finished_at=clock_timestamp()
      WHERE delivery_id=$1 AND outcome='RUNNING'`, [deliveryId]);
    await query(`UPDATE webhook_deliveries SET status='PENDING',retry_count=0,next_attempt_at=clock_timestamp(),
    finished_at=NULL, error_code=NULL, lease_token=NULL, lease_expires_at=NULL
    WHERE id=$1`, [deliveryId]);
    return true;
  });
}
