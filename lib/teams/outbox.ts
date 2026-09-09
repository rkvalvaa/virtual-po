import { query, transaction } from '@/lib/db/pool'
import { buildRequestCard, sendTeamsWebhook } from './client'
import { getApplicationBaseUrl } from '@/lib/email/config'
import { teamsReadiness } from './config'

const MAX_ATTEMPTS = 5
export type TeamsDeliveryStatus = 'UNAVAILABLE' | 'QUEUED' | 'PROCESSING' | 'ACCEPTED' | 'FAILED' | 'RECONCILIATION_REQUIRED'
export interface TeamsDeliverySummary { id: string; channelName: string; eventType: string; status: TeamsDeliveryStatus; attemptCount: number; errorMessage: string | null; createdAt: string }

const actionEvent: Record<string, string> = {
  REQUEST_CREATED: 'REQUEST_CREATED', STATUS_CHANGED: 'STATUS_CHANGED', DECISION_MADE: 'DECISION_MADE',
  ASSESSMENT_COMPLETED: 'ASSESSMENT_COMPLETE',
}

export async function enqueueTeamsActivity(activity: { id: string; organizationId: string; requestId: string | null; action: string }): Promise<void> {
  const event = actionEvent[activity.action]
  if (!event || !activity.requestId) return
  const readiness = teamsReadiness()
  await query(`INSERT INTO teams_deliveries(organization_id,notification_config_id,activity_id,request_id,event_type,payload,status,error_code,error_message)
    SELECT n.organization_id,n.id,$1,r.id,$3,jsonb_build_object('id',r.id,'title',r.title,'status',r.status,'priorityScore',r.priority_score,'complexity',r.complexity),$4,$5,$6
    FROM teams_notifications n JOIN feature_requests r ON r.id=$2 AND r.organization_id=n.organization_id
    WHERE n.organization_id=$7 AND n.event_type=$3 AND n.is_active
      AND EXISTS (SELECT 1 FROM integrations i WHERE i.organization_id=n.organization_id AND i.type='TEAMS' AND i.is_active)
    ON CONFLICT(notification_config_id,activity_id) DO NOTHING`, [activity.id, activity.requestId, event,
    readiness.notifications === 'READY' ? 'QUEUED' : 'UNAVAILABLE', readiness.notifications === 'READY' ? null : 'NOT_VALIDATED',
    readiness.notifications === 'READY' ? null : readiness.message, activity.organizationId])
}

export async function processTeamsOutbox(orgId?: string): Promise<{ processed: number }> {
  if (teamsReadiness().notifications !== 'READY') return { processed: 0 }
  const claims = await transaction(async () => {
    await query(`UPDATE teams_deliveries SET
      status=CASE WHEN provider_started_at IS NOT NULL THEN 'RECONCILIATION_REQUIRED' WHEN attempt_count >= $2 THEN 'FAILED' ELSE 'QUEUED' END,
      error_code=CASE WHEN provider_started_at IS NOT NULL THEN 'AMBIGUOUS_OUTCOME' WHEN attempt_count >= $2 THEN 'RETRY_LIMIT_REACHED' ELSE 'WORKER_INTERRUPTED' END,
      error_message=CASE WHEN provider_started_at IS NOT NULL THEN 'The provider outcome is unknown; automatic retry is blocked.'
        WHEN attempt_count >= $2 THEN 'The worker stopped before provider I/O after the retry limit was reached.' ELSE 'The worker stopped before provider I/O.' END,
      lease_token=NULL,lease_expires_at=NULL,
      finished_at=CASE WHEN provider_started_at IS NULL AND attempt_count < $2 THEN NULL ELSE clock_timestamp() END,updated_at=clock_timestamp()
      WHERE status='PROCESSING' AND lease_expires_at<=clock_timestamp() AND ($1::uuid IS NULL OR organization_id=$1)`, [orgId ?? null, MAX_ATTEMPTS])
    const result = await query(`WITH due AS (SELECT id FROM teams_deliveries WHERE status='QUEUED' AND next_attempt_at<=clock_timestamp()
      AND attempt_count<$2 AND ($1::uuid IS NULL OR organization_id=$1) ORDER BY next_attempt_at,id LIMIT 20 FOR UPDATE SKIP LOCKED)
      UPDATE teams_deliveries d SET status='PROCESSING',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',provider_started_at=NULL,updated_at=clock_timestamp()
      FROM due WHERE d.id=due.id RETURNING d.id,d.lease_token`, [orgId ?? null, MAX_ATTEMPTS])
    return result.rows as { id: string; lease_token: string }[]
  })
  await Promise.all(claims.map(async claim => {
    try { await deliver(claim.id, claim.lease_token) }
    catch { await failUnexpected(claim.id, claim.lease_token) }
  }))
  return { processed: claims.length }
}

async function deliver(id: string, lease: string): Promise<void> {
  const row = await query(`SELECT d.*,n.webhook_url,n.is_active,EXISTS(SELECT 1 FROM integrations i WHERE i.organization_id=d.organization_id AND i.type='TEAMS' AND i.is_active) AS integration_active FROM teams_deliveries d JOIN teams_notifications n ON n.id=d.notification_config_id
    JOIN feature_requests r ON r.id=d.request_id AND r.organization_id=d.organization_id
    WHERE d.id=$1 AND d.lease_token=$2 AND d.status='PROCESSING' AND d.lease_expires_at>clock_timestamp()`, [id, lease])
  const delivery = row.rows[0]
  if (!delivery) return
  if (!delivery.is_active || !delivery.integration_active) return finish(id, lease, 'FAILED', null, 'DESTINATION_UNAVAILABLE', 'The Teams destination is no longer active.')
  const card = delivery.provider_payload ?? buildRequestCard(delivery.payload, getApplicationBaseUrl())
  const frozen = await query(`UPDATE teams_deliveries SET provider_payload=COALESCE(provider_payload,$3),provider_started_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=$1 AND lease_token=$2 AND status='PROCESSING' AND lease_expires_at>clock_timestamp() RETURNING attempt_count`, [id, lease, JSON.stringify(card)])
  if (!frozen.rowCount) return
  try {
    const result = await sendTeamsWebhook(delivery.webhook_url, card)
    if (result.accepted) return finish(id, lease, 'ACCEPTED', result.httpStatus, null, null)
    if (result.ambiguous) return finish(id, lease, 'RECONCILIATION_REQUIRED', result.httpStatus, 'AMBIGUOUS_OUTCOME', 'Teams returned an ambiguous response; automatic retry is blocked.')
    const retry = result.retryable && Number(frozen.rows[0].attempt_count) < MAX_ATTEMPTS
    return finish(id, lease, retry ? 'QUEUED' : 'FAILED', result.httpStatus, retry ? 'TRANSIENT_PROVIDER_ERROR' : 'PROVIDER_REJECTED', result.message)
  } catch {
    return finish(id, lease, 'RECONCILIATION_REQUIRED', null, 'AMBIGUOUS_OUTCOME', 'The Teams request ended without a confirmed response; automatic retry is blocked.')
  }
}

async function failUnexpected(id: string, lease: string): Promise<void> {
  await transaction(async () => {
    const current = await query('SELECT provider_started_at FROM teams_deliveries WHERE id=$1 AND lease_token=$2 AND status=\'PROCESSING\' FOR UPDATE', [id, lease])
    if (!current.rowCount) return
    const ambiguous = Boolean(current.rows[0].provider_started_at)
    await finish(id, lease, ambiguous ? 'RECONCILIATION_REQUIRED' : 'FAILED', null,
      ambiguous ? 'AMBIGUOUS_OUTCOME' : 'DELIVERY_SETUP_FAILED',
      ambiguous ? 'The Teams provider outcome is unknown; automatic retry is blocked.' : 'The Teams delivery could not be prepared safely.')
  })
}

async function finish(id: string, lease: string, status: TeamsDeliveryStatus, httpStatus: number | null, code: string | null, message: string | null) {
  await query(`UPDATE teams_deliveries SET status=$3,http_status=$4,error_code=$5,error_message=$6,lease_token=NULL,lease_expires_at=NULL,
    next_attempt_at=clock_timestamp()+interval '1 minute',finished_at=CASE WHEN $3='QUEUED' THEN NULL ELSE clock_timestamp() END,updated_at=clock_timestamp()
    WHERE id=$1 AND lease_token=$2 AND status='PROCESSING'`, [id, lease, status, httpStatus, code, message])
}

export async function listTeamsDeliveries(orgId: string): Promise<TeamsDeliverySummary[]> {
  const result = await query(`SELECT d.*,n.channel_name FROM teams_deliveries d JOIN teams_notifications n ON n.id=d.notification_config_id
    WHERE d.organization_id=$1 ORDER BY d.created_at DESC LIMIT 20`, [orgId])
  return result.rows.map(row => ({ id: row.id, channelName: row.channel_name, eventType: row.event_type, status: row.status,
    attemptCount: Number(row.attempt_count), errorMessage: row.error_message, createdAt: row.created_at.toISOString() }))
}

export async function retryTeamsDelivery(orgId: string, id: string): Promise<boolean> {
  if (teamsReadiness().notifications !== 'READY') return false
  const result = await query(`UPDATE teams_deliveries SET status='QUEUED',next_attempt_at=clock_timestamp(),error_code=NULL,error_message=NULL,finished_at=NULL,updated_at=clock_timestamp()
    WHERE id=$1 AND organization_id=$2 AND status IN ('FAILED','UNAVAILABLE') AND attempt_count<$3 RETURNING id`, [id, orgId, MAX_ATTEMPTS])
  return Boolean(result.rowCount)
}
