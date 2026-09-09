import { query, transaction } from '@/lib/db/pool'
import { log } from '@/lib/logging/logger'
import { emailReadiness, getApplicationBaseUrl } from './config'
import { renderNotificationEmail, type NotificationEmailContent } from './render'
import { sendProviderEmail, type ProviderEmail } from './provider'

const MAX_ATTEMPTS = 5
const MAX_MANUAL_RETRIES = 1
const LEASE_SECONDS = 60
const IDEMPOTENCY_WINDOW_HOURS = 24

export type EmailDeliveryStatus = 'UNAVAILABLE' | 'QUEUED' | 'PROCESSING' | 'ACCEPTED' | 'DELIVERED' | 'FAILED' | 'RECONCILIATION_REQUIRED'

export interface EmailDeliverySummary {
  id: string
  kind: 'NOTIFICATION' | 'TEST'
  recipientEmail: string
  status: EmailDeliveryStatus
  attemptCount: number
  providerMessageId: string | null
  errorCode: string | null
  errorMessage: string | null
  acceptedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

interface EnqueueNotificationInput extends NotificationEmailContent {
  organizationId: string
  notificationId: string
  recipientUserId: string
  recipientEmail: string
}

export interface ProviderEventInput {
  eventId: string
  providerMessageId: string
  eventType: string
  occurredAt: Date
  detail: string | null
  deliveryId: string | null
}

type Scope = { orgId?: string; deliveryId?: string; limit?: number }
export interface ClaimedEmailDelivery { id: string; leaseToken: string }

function summary(row: Record<string, unknown>): EmailDeliverySummary {
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null
  return {
    id: String(row.id),
    kind: row.kind as EmailDeliverySummary['kind'],
    recipientEmail: String(row.recipient_email),
    status: row.status as EmailDeliveryStatus,
    attemptCount: Number(row.attempt_count),
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    acceptedAt: iso(row.accepted_at),
    deliveredAt: iso(row.delivered_at),
    createdAt: iso(row.created_at)!,
  }
}

export async function enqueueNotificationEmail(input: EnqueueNotificationInput): Promise<EmailDeliverySummary> {
  const readiness = emailReadiness()
  const status = readiness.state === 'CONFIGURED' ? 'QUEUED' : 'UNAVAILABLE'
  const result = await query(`INSERT INTO email_deliveries(
      organization_id,notification_id,recipient_user_id,recipient_email,recipient_name,kind,payload,status,error_code,error_message)
    VALUES($1,$2,$3,$4,$5,'NOTIFICATION',$6,$7,$8,$9)
    ON CONFLICT (notification_id) WHERE notification_id IS NOT NULL DO UPDATE SET notification_id=EXCLUDED.notification_id
    RETURNING *`, [
    input.organizationId, input.notificationId, input.recipientUserId, input.recipientEmail, input.recipientName,
    JSON.stringify({ type: input.type, title: input.title, message: input.message, link: input.link ?? null }), status,
    status === 'UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : null,
    status === 'UNAVAILABLE' ? readiness.message : null,
  ])
  return summary(result.rows[0])
}

export async function enqueueAdminTestEmail(orgId: string, userId: string): Promise<EmailDeliverySummary> {
  return transaction(async () => {
    const member = await query(`SELECT u.email,u.name FROM organization_users ou JOIN users u ON u.id=ou.user_id
      WHERE ou.organization_id=$1 AND ou.user_id=$2 AND ou.role='ADMIN' FOR SHARE OF ou,u`, [orgId, userId])
    if (!member.rows.length) throw new Error('A current administrator membership is required to send an email test.')
    const readiness = emailReadiness()
    const status = readiness.state === 'CONFIGURED' ? 'QUEUED' : 'UNAVAILABLE'
    const result = await query(`INSERT INTO email_deliveries(
        organization_id,recipient_user_id,recipient_email,recipient_name,kind,payload,status,error_code,error_message)
      VALUES($1,$2,$3,$4,'TEST',$5,$6,$7,$8) RETURNING *`, [
      orgId, userId, member.rows[0].email, member.rows[0].name,
      JSON.stringify({ type: 'STATUS_CHANGED', title: 'Email delivery test', message: 'This test confirms that the email provider accepted a message from the configured sender.', link: '/settings' }),
      status, status === 'UNAVAILABLE' ? 'PROVIDER_UNAVAILABLE' : null, status === 'UNAVAILABLE' ? readiness.message : null,
    ])
    return summary(result.rows[0])
  })
}

async function recoverExpiredLeases(filter: unknown[]): Promise<void> {
  const expired = await query(`SELECT d.id,d.retry_count,d.idempotency_expires_at,a.lease_token,a.provider_started_at
    FROM email_deliveries d JOIN email_delivery_attempts a ON a.lease_token=d.lease_token
    WHERE d.status='PROCESSING' AND d.lease_expires_at <= clock_timestamp() AND a.outcome='PROCESSING'
      AND ($1::uuid IS NULL OR d.organization_id=$1) AND ($2::uuid IS NULL OR d.id=$2)
    LIMIT 100 FOR UPDATE OF d,a SKIP LOCKED`, filter)
  for (const row of expired.rows) {
    const providerStarted = Boolean(row.provider_started_at)
    const withinWindow = row.idempotency_expires_at && new Date(row.idempotency_expires_at).getTime() > Date.now()
    const retry = providerStarted && row.retry_count < MAX_ATTEMPTS && withinWindow
    const status: EmailDeliveryStatus = !providerStarted ? 'QUEUED' : retry ? 'QUEUED' : 'RECONCILIATION_REQUIRED'
    await query(`UPDATE email_delivery_attempts SET outcome=$2,error_code=$3,error_message=$4,finished_at=clock_timestamp()
      WHERE lease_token=$1 AND outcome='PROCESSING'`, [
      row.lease_token, providerStarted ? 'UNKNOWN' : 'INTERRUPTED',
      providerStarted ? 'LEASE_EXPIRED' : 'WORKER_INTERRUPTED',
      providerStarted ? 'The worker lease expired after the provider request started.' : 'The worker stopped before contacting the provider.',
    ])
    await query(`UPDATE email_deliveries SET status=$2,
      retry_count=CASE WHEN $3 THEN retry_count ELSE GREATEST(retry_count-1,0) END,
      error_code=CASE WHEN $3 THEN 'AMBIGUOUS_OUTCOME' ELSE 'WORKER_INTERRUPTED' END,
      error_message=CASE WHEN $3 THEN 'The provider outcome is unknown. Reconciliation is required if the 24-hour idempotency window closes.' ELSE 'The worker stopped before contacting the provider; the delivery remains queued.' END,
      lease_token=NULL,lease_expires_at=NULL,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp(),
      finished_at=CASE WHEN $2='RECONCILIATION_REQUIRED' THEN clock_timestamp() ELSE NULL END
      WHERE id=$1`, [row.id, status, providerStarted])
  }
}

export async function claimEmailDeliveries(scope: Scope = {}): Promise<ClaimedEmailDelivery[]> {
  return transaction(async () => {
    const filter = [scope.orgId ?? null, scope.deliveryId ?? null]
    await recoverExpiredLeases(filter)
    await query(`UPDATE email_deliveries SET
      status=CASE WHEN error_code='AMBIGUOUS_OUTCOME' THEN 'RECONCILIATION_REQUIRED' ELSE 'FAILED' END,
      error_code=CASE WHEN error_code='AMBIGUOUS_OUTCOME' THEN error_code ELSE 'IDEMPOTENCY_WINDOW_EXPIRED' END,
      error_message=CASE WHEN error_code='AMBIGUOUS_OUTCOME'
        THEN 'The provider outcome is unknown and its 24-hour idempotency window expired. Reconcile with the provider before any new send.'
        ELSE 'The safe provider retry window expired. Use the visible manual retry for this confirmed failure.' END,
      finished_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE status='QUEUED' AND idempotency_expires_at <= clock_timestamp()
        AND ($1::uuid IS NULL OR organization_id=$1) AND ($2::uuid IS NULL OR id=$2)`, filter)

    const claimed = await query(`WITH candidate AS (
      SELECT id FROM email_deliveries WHERE status='QUEUED' AND next_attempt_at <= clock_timestamp() AND retry_count < $4
      AND ($1::uuid IS NULL OR organization_id=$1) AND ($2::uuid IS NULL OR id=$2)
      ORDER BY next_attempt_at,id LIMIT $3 FOR UPDATE SKIP LOCKED
    ) UPDATE email_deliveries d SET status='PROCESSING',attempt_count=attempt_count+1,retry_count=retry_count+1,
      lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+($5 * interval '1 second'),updated_at=clock_timestamp()
      FROM candidate c WHERE d.id=c.id RETURNING d.id,d.lease_token,d.attempt_count,d.idempotency_generation`, [
      ...filter, Math.max(1, Math.min(scope.limit ?? 10, 20)), MAX_ATTEMPTS, LEASE_SECONDS,
    ])
    for (const row of claimed.rows) {
      await query(`INSERT INTO email_delivery_attempts(delivery_id,attempt_number,lease_token,provider_idempotency_key)
        VALUES($1,$2,$3,$4)`, [row.id, row.attempt_count, row.lease_token, `email-delivery/${row.id}/${row.idempotency_generation}`])
    }
    return claimed.rows.map(row => ({ id: row.id, leaseToken: row.lease_token }))
  })
}

async function recipientIsEligible(deliveryId: string, leaseToken: string): Promise<boolean> {
  const result = await query(`SELECT EXISTS(
    SELECT 1 FROM email_deliveries d
    JOIN users u ON u.id=d.recipient_user_id AND lower(u.email)=lower(d.recipient_email)
    JOIN organization_users ou ON ou.organization_id=d.organization_id AND ou.user_id=u.id
    WHERE d.id=$1 AND d.lease_token=$2
      AND ((d.kind='TEST' AND ou.role='ADMIN') OR (d.kind='NOTIFICATION' AND EXISTS(
        SELECT 1 FROM notifications n
        LEFT JOIN feature_requests r ON r.id=n.request_id AND r.organization_id=n.organization_id
        WHERE n.id=d.notification_id AND n.organization_id=d.organization_id AND n.user_id=d.recipient_user_id
          AND (n.request_id IS NULL OR r.id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM email_preferences p WHERE p.user_id=d.recipient_user_id
            AND p.organization_id=d.organization_id AND p.notification_type=n.type AND p.email_enabled=false)
      )))
  ) AS eligible`, [deliveryId, leaseToken])
  return Boolean(result.rows[0]?.eligible)
}

async function finishWithoutProvider(claim: ClaimedEmailDelivery, status: 'FAILED' | 'UNAVAILABLE', errorCode: string, errorMessage: string) {
  await transaction(async () => {
    const updated = await query(`UPDATE email_deliveries SET status=$3,error_code=$4,error_message=$5,
      lease_token=NULL,lease_expires_at=NULL,finished_at=CASE WHEN $3='FAILED' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp()
      WHERE id=$1 AND lease_token=$2 AND status='PROCESSING' RETURNING id`, [claim.id, claim.leaseToken, status, errorCode, errorMessage])
    if (updated.rowCount) await query(`UPDATE email_delivery_attempts SET outcome='FAILED',error_code=$2,error_message=$3,finished_at=clock_timestamp()
      WHERE lease_token=$1`, [claim.leaseToken, errorCode, errorMessage])
  })
}

async function freezeProviderRequest(delivery: Record<string, unknown>, claim: ClaimedEmailDelivery, readiness: ReturnType<typeof emailReadiness>): Promise<{ email: ProviderEmail; expiresAt: Date } | null> {
  if (delivery.provider_payload) {
    const expiresAt = new Date(delivery.idempotency_expires_at as string | Date)
    if (expiresAt.getTime() <= Date.now()) return null
    await query('UPDATE email_delivery_attempts SET provider_started_at=clock_timestamp() WHERE lease_token=$1', [claim.leaseToken])
    return { email: delivery.provider_payload as ProviderEmail, expiresAt }
  }

  const payload = delivery.payload as NotificationEmailContent
  const rendered = renderNotificationEmail({ ...payload, recipientName: delivery.recipient_name as string | null }, getApplicationBaseUrl())
  const email: ProviderEmail = {
    from: readiness.sender!, to: String(delivery.recipient_email), ...rendered,
    idempotencyKey: `email-delivery/${delivery.id}/${delivery.idempotency_generation}`,
    tags: [{ name: 'delivery_id', value: String(delivery.id) }],
  }
  const frozen = await transaction(async () => {
    const updated = await query(`UPDATE email_deliveries SET provider_payload=$3,first_attempt_at=COALESCE(first_attempt_at,clock_timestamp()),
      idempotency_expires_at=COALESCE(idempotency_expires_at,clock_timestamp()+($4 * interval '1 hour')),updated_at=clock_timestamp()
      WHERE id=$1 AND lease_token=$2 AND status='PROCESSING' RETURNING idempotency_expires_at`, [
      claim.id, claim.leaseToken, JSON.stringify(email), IDEMPOTENCY_WINDOW_HOURS,
    ])
    if (!updated.rowCount) return null
    await query('UPDATE email_delivery_attempts SET provider_started_at=clock_timestamp() WHERE lease_token=$1', [claim.leaseToken])
    return new Date(updated.rows[0].idempotency_expires_at)
  })
  return frozen ? { email, expiresAt: frozen } : null
}

export async function deliverClaimedEmail(claim: ClaimedEmailDelivery): Promise<void> {
  const current = await query(`SELECT * FROM email_deliveries WHERE id=$1 AND lease_token=$2 AND status='PROCESSING'
    AND lease_expires_at > clock_timestamp()`, [claim.id, claim.leaseToken])
  const delivery = current.rows[0]
  if (!delivery) return
  if (!await recipientIsEligible(claim.id, claim.leaseToken)) {
    await finishWithoutProvider(claim, 'FAILED', 'RECIPIENT_INELIGIBLE', 'The recipient no longer has access, uses another address, or disabled this notification.')
    return
  }

  const readiness = emailReadiness()
  if (readiness.state === 'UNAVAILABLE') {
    await finishWithoutProvider(claim, 'UNAVAILABLE', 'PROVIDER_UNAVAILABLE', readiness.message)
    return
  }
  const frozen = await freezeProviderRequest(delivery, claim, readiness)
  if (!frozen) {
    await finishWithoutProvider(claim, 'FAILED', 'IDEMPOTENCY_WINDOW_EXPIRED', 'The safe provider retry window expired before this attempt started.')
    return
  }

  let accepted = false
  let providerMessageId: string | null = null
  let errorCode: string | null = null
  let errorMessage: string | null = null
  let retryable = false
  let ambiguous = false
  try {
    const provider = await sendProviderEmail(frozen.email)
    if (provider.accepted) { accepted = true; providerMessageId = provider.providerMessageId }
    else { errorCode = provider.errorCode; errorMessage = provider.message; retryable = provider.retryable }
  } catch {
    ambiguous = true
    retryable = true
    errorCode = 'AMBIGUOUS_OUTCOME'
    errorMessage = 'The provider request ended without a confirmed response.'
  }

  const retry = !accepted && retryable && delivery.retry_count < MAX_ATTEMPTS && frozen.expiresAt.getTime() > Date.now()
  const status: EmailDeliveryStatus = accepted ? 'ACCEPTED' : retry ? 'QUEUED' : ambiguous ? 'RECONCILIATION_REQUIRED' : 'FAILED'
  const attemptOutcome = accepted ? 'ACCEPTED' : ambiguous ? 'UNKNOWN' : 'FAILED'
  const recorded = await transaction(async () => {
    const updated = await query(`UPDATE email_deliveries SET status=$3,provider_message_id=COALESCE(provider_message_id,$4),error_code=$5,error_message=$6,
      lease_token=NULL,lease_expires_at=NULL,next_attempt_at=clock_timestamp()+($7 * interval '1 second'),updated_at=clock_timestamp(),
      accepted_at=CASE WHEN $3='ACCEPTED' THEN clock_timestamp() ELSE accepted_at END,
      finished_at=CASE WHEN $3='QUEUED' THEN NULL ELSE clock_timestamp() END
      WHERE id=$1 AND lease_token=$2 AND status='PROCESSING' RETURNING provider_message_id`, [
      claim.id, claim.leaseToken, status, providerMessageId, errorCode, errorMessage, 60 * 2 ** (Number(delivery.retry_count) - 1),
    ])
    if (!updated.rows.length) return false
    await query(`UPDATE email_delivery_attempts SET outcome=$2,error_code=$3,error_message=$4,finished_at=clock_timestamp()
      WHERE lease_token=$1`, [claim.leaseToken, attemptOutcome, errorCode, errorMessage])
    if (updated.rows[0].provider_message_id) await reconcileProviderEvents(updated.rows[0].provider_message_id)
    return true
  })
  if (recorded) log.info('email.delivery', { deliveryId: delivery.id, organizationId: delivery.organization_id, status, attempt: delivery.attempt_count, errorCode })
}

export async function processEmailOutbox(scope: Scope = {}): Promise<{ processed: number }> {
  const claims = await claimEmailDeliveries(scope)
  await Promise.all(claims.map(async claim => {
    try { await deliverClaimedEmail(claim) }
    catch { await failUnexpectedClaim(claim) }
  }))
  return { processed: claims.length }
}

async function failUnexpectedClaim(claim: ClaimedEmailDelivery): Promise<void> {
  await transaction(async () => {
    const attempt = await query('SELECT provider_started_at FROM email_delivery_attempts WHERE lease_token=$1 FOR UPDATE', [claim.leaseToken])
    if (!attempt.rowCount) return
    const ambiguous = Boolean(attempt.rows[0].provider_started_at)
    await query(`UPDATE email_deliveries SET status=$3,error_code=$4,error_message=$5,lease_token=NULL,lease_expires_at=NULL,
      finished_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND status='PROCESSING'`, [
      claim.id, claim.leaseToken, ambiguous ? 'RECONCILIATION_REQUIRED' : 'FAILED', ambiguous ? 'AMBIGUOUS_OUTCOME' : 'DELIVERY_SETUP_FAILED',
      ambiguous ? 'The provider outcome is unknown; reconciliation is required.' : 'The delivery could not be prepared safely.',
    ])
    await query(`UPDATE email_delivery_attempts SET outcome=$2,error_code=$3,error_message=$4,finished_at=clock_timestamp()
      WHERE lease_token=$1 AND outcome='PROCESSING'`, [claim.leaseToken, ambiguous ? 'UNKNOWN' : 'FAILED',
      ambiguous ? 'AMBIGUOUS_OUTCOME' : 'DELIVERY_SETUP_FAILED', ambiguous ? 'The provider outcome is unknown.' : 'The delivery could not be prepared safely.'])
  })
}

export async function listEmailDeliveries(orgId: string, limit = 20): Promise<EmailDeliverySummary[]> {
  const result = await query(`SELECT * FROM email_deliveries WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`, [orgId, Math.max(1, Math.min(limit, 100))])
  return result.rows.map(summary)
}

export async function retryEmailDelivery(orgId: string, deliveryId: string, adminUserId: string): Promise<boolean> {
  if (emailReadiness().state !== 'CONFIGURED') return false
  const result = await query(`UPDATE email_deliveries SET status='QUEUED',retry_count=0,manual_retry_count=manual_retry_count+1,
    idempotency_generation=idempotency_generation+1,provider_payload=NULL,first_attempt_at=NULL,idempotency_expires_at=NULL,
    provider_message_id=NULL,provider_event_at=NULL,accepted_at=NULL,delivered_at=NULL,next_attempt_at=clock_timestamp(),
    lease_token=NULL,lease_expires_at=NULL,error_code=NULL,error_message=NULL,finished_at=NULL,updated_at=clock_timestamp()
    WHERE id=$1 AND organization_id=$2 AND status IN ('FAILED','UNAVAILABLE') AND manual_retry_count < $4
      AND error_code IS DISTINCT FROM 'RECIPIENT_INELIGIBLE'
      AND EXISTS (SELECT 1 FROM organization_users ou
        WHERE ou.organization_id=$2 AND ou.user_id=$3 AND ou.role='ADMIN')
    RETURNING id`, [deliveryId, orgId, adminUserId, MAX_MANUAL_RETRIES])
  return Boolean(result.rowCount)
}

async function reconcileProviderEvents(providerMessageId: string): Promise<void> {
  const delivery = await query('SELECT id,lease_token FROM email_deliveries WHERE provider_message_id=$1', [providerMessageId])
  if (!delivery.rowCount) return
  await query(`UPDATE email_provider_events SET delivery_id=$2,processed_at=clock_timestamp()
    WHERE provider_message_id=$1 AND delivery_id IS NULL`, [providerMessageId, delivery.rows[0].id])
  const event = await query(`SELECT * FROM email_provider_events WHERE provider_message_id=$1
    AND event_type IN ('email.delivered','email.failed','email.bounced','email.suppressed')
    ORDER BY occurred_at DESC,received_at DESC LIMIT 1`, [providerMessageId])
  if (!event.rowCount) return
  const row = event.rows[0]
  const status: 'DELIVERED' | 'FAILED' = row.event_type === 'email.delivered' ? 'DELIVERED' : 'FAILED'
  const updated = await query(`UPDATE email_deliveries SET status=$2,provider_event_at=$3,
      delivered_at=CASE WHEN $2='DELIVERED' THEN $3 ELSE delivered_at END,
      error_code=CASE WHEN $2='FAILED' THEN upper(replace($4,'.','_')) ELSE NULL END,
      error_message=CASE WHEN $2='FAILED' THEN COALESCE($5,'The provider reported final delivery failure.') ELSE NULL END,
      lease_token=NULL,lease_expires_at=NULL,finished_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE provider_message_id=$1 AND (provider_event_at IS NULL OR provider_event_at <= $3) RETURNING id`, [
    providerMessageId, status, row.occurred_at, row.event_type, row.detail,
  ])
  if (updated.rowCount && delivery.rows[0].lease_token) {
    await query(`UPDATE email_delivery_attempts SET outcome=$2,error_code=CASE WHEN $2='FAILED' THEN $3 ELSE NULL END,
      error_message=CASE WHEN $2='FAILED' THEN COALESCE($4,'The provider reported final delivery failure.') ELSE NULL END,
      finished_at=clock_timestamp() WHERE lease_token=$1 AND outcome='PROCESSING'`, [
      delivery.rows[0].lease_token, status === 'DELIVERED' ? 'ACCEPTED' : 'FAILED', row.event_type, row.detail,
    ])
  }
}

export async function ingestEmailProviderEvent(input: ProviderEventInput): Promise<boolean> {
  return transaction(async () => {
    const inserted = await query(`INSERT INTO email_provider_events(svix_id,provider_message_id,event_type,detail,occurred_at,delivery_reference)
      VALUES($1,$2,$3,$4,$5,(SELECT id FROM email_deliveries WHERE id=$6)) ON CONFLICT(svix_id) DO NOTHING RETURNING svix_id`, [
      input.eventId, input.providerMessageId, input.eventType, input.detail, input.occurredAt, input.deliveryId,
    ])
    if (!inserted.rowCount) return false
    if (input.deliveryId) {
      await query(`UPDATE email_deliveries SET provider_message_id=COALESCE(provider_message_id,$2),updated_at=clock_timestamp()
        WHERE id=$1 AND (provider_message_id IS NULL OR provider_message_id=$2)`, [input.deliveryId, input.providerMessageId])
    }
    await reconcileProviderEvents(input.providerMessageId)
    return true
  })
}
