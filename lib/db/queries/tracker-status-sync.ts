import { query, transaction } from '@/lib/db/pool'
import { mapRow, mapRows } from '@/lib/db/mappers'
import { REQUEST_STATUSES, type RequestStatus } from '@/lib/types/database'
import { canTransition } from '@/lib/utils/workflow'
import { assertNoApprovalChainBypass } from '@/lib/approvals/engine'
import type { StatusMapping } from '@/lib/status-sync/types'
import { enqueueTeamsActivity } from '@/lib/teams/outbox'

export interface StatusSyncConfig {
  id: string
  organizationId: string
  provider: 'LINEAR'
  destination: string
  enabled: boolean
  mappings: StatusMapping[]
  checkpointAt: Date | null
  lastSyncAt: Date | null
  lastReconciledAt: Date | null
  lastError: string | null
  failureCount: number
  nextAttemptAt: Date
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface StatusSyncConflict {
  id: string
  organizationId: string
  linkId: string
  requestId: string
  requestTitle: string
  remoteStatusId: string | null
  remoteStatusName: string
  mappedStatus: RequestStatus
  localStatus: RequestStatus
  reason: string
  eventFingerprint: string
  createdAt: Date
}

export function normalizeStatusMappings(input: StatusMapping[]): StatusMapping[] {
  if (!Array.isArray(input) || input.length > 100) throw new Error('Status mappings must be a list of at most 100 entries.')
  const ids = new Set<string>()
  return input.map(mapping => {
    const remoteStatusId = mapping.remoteStatusId?.trim()
    const remoteStatusName = mapping.remoteStatusName?.trim()
    if (!remoteStatusId || !remoteStatusName) throw new Error('Every mapping requires a Linear status ID and name.')
    if (ids.has(remoteStatusId)) throw new Error('Each Linear status can only be mapped once.')
    ids.add(remoteStatusId)
    if (!REQUEST_STATUSES.includes(mapping.targetStatus)) throw new Error('Select a valid VPO request status.')
    return { remoteStatusId, remoteStatusName, targetStatus: mapping.targetStatus }
  })
}

export async function upsertStatusSyncConfig(input: {
  organizationId: string
  provider: 'LINEAR'
  destination: string
  enabled: boolean
  mappings: StatusMapping[]
  updatedBy: string
}): Promise<StatusSyncConfig> {
  const destination = input.destination.trim()
  if (!destination) throw new Error('A Linear team is required.')
  const mappings = normalizeStatusMappings(input.mappings)
  const result = await query(
    `INSERT INTO tracker_status_sync_configs
       (organization_id, provider, destination, enabled, mappings, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, provider, destination) DO UPDATE
     SET enabled = EXCLUDED.enabled, mappings = EXCLUDED.mappings, updated_by = EXCLUDED.updated_by,
         next_attempt_at = clock_timestamp(), updated_at = clock_timestamp()
     RETURNING *`,
    [input.organizationId, input.provider, destination, input.enabled, JSON.stringify(mappings), input.updatedBy],
  )
  return mapRow<StatusSyncConfig>(result.rows[0])
}

export async function getStatusSyncConfig(organizationId: string, provider: 'LINEAR', destination: string): Promise<StatusSyncConfig | null> {
  const result = await query(
    `SELECT * FROM tracker_status_sync_configs
     WHERE organization_id = $1 AND provider = $2 AND destination = $3`,
    [organizationId, provider, destination],
  )
  return result.rows[0] ? mapRow<StatusSyncConfig>(result.rows[0]) : null
}

export async function listDueStatusSyncConfigs(now = new Date()): Promise<StatusSyncConfig[]> {
  const result = await query(
    `WITH due AS (
       SELECT id FROM tracker_status_sync_configs
       WHERE enabled = true AND next_attempt_at <= $1
       ORDER BY next_attempt_at, id
       FOR UPDATE SKIP LOCKED
     )
     UPDATE tracker_status_sync_configs c
     SET next_attempt_at = $1::timestamptz + interval '10 minutes'
     FROM due WHERE c.id = due.id
     RETURNING c.*`,
    [now],
  )
  return mapRows<StatusSyncConfig>(result.rows)
}

export async function recordStatusSyncSuccess(configId: string, syncedAt: Date, checkpointAt?: Date): Promise<void> {
  await query(
    `UPDATE tracker_status_sync_configs
     SET checkpoint_at = CASE WHEN $3::timestamptz IS NULL THEN checkpoint_at ELSE GREATEST(checkpoint_at, $3::timestamptz) END,
         last_sync_at = GREATEST(last_sync_at, $2::timestamptz), last_error = NULL,
         failure_count = 0, next_attempt_at = GREATEST(last_sync_at, $2::timestamptz) + interval '5 minutes', updated_at = clock_timestamp()
     WHERE id = $1`,
    [configId, syncedAt, checkpointAt ?? null],
  )
}

export async function recordStatusReconcileSuccess(configId: string, reconciledAt: Date): Promise<void> {
  await query(
    `UPDATE tracker_status_sync_configs
     SET last_reconciled_at = GREATEST(last_reconciled_at, $2::timestamptz),
         last_sync_at = GREATEST(last_sync_at, $2::timestamptz), last_error = NULL,
         failure_count = 0, updated_at = clock_timestamp()
     WHERE id = $1`,
    [configId, reconciledAt],
  )
}

export async function recordStatusSyncFailure(configId: string, message: string, now = new Date()): Promise<void> {
  await query(
    `UPDATE tracker_status_sync_configs
     SET last_error = left($2, 2000), failure_count = LEAST(failure_count + 1, 5),
         next_attempt_at = $3::timestamptz + (interval '1 minute' * power(2, LEAST(failure_count + 1, 5))),
         updated_at = clock_timestamp()
     WHERE id = $1`,
    [configId, message, now],
  )
}

export async function listLinearImportLinks(organizationId: string, destination: string): Promise<Array<{ remoteEntityId: string }>> {
  const result = await query<{ remote_entity_id: string }>(
    `SELECT remote_entity_id FROM tracker_import_links
     WHERE organization_id = $1 AND provider = 'LINEAR' AND destination = $2
     ORDER BY id`,
    [organizationId, destination],
  )
  return result.rows.map(row => ({ remoteEntityId: row.remote_entity_id }))
}

interface Observation {
  organizationId: string
  destination: string
  remoteEntityId: string
  remoteStatusId: string | null
  remoteStatusName: string | null
  remoteUpdatedAt: Date | null
  mappedStatus: RequestStatus | null
  fingerprint: string
}

const SUPPORTED_DELIVERY_EDGES = new Set([
  'APPROVED:IN_BACKLOG',
  'IN_BACKLOG:IN_PROGRESS',
  'IN_PROGRESS:IN_BACKLOG',
  'IN_PROGRESS:COMPLETED',
])

async function inboundTransitionConflictReason(
  organizationId: string,
  requestId: string,
  from: RequestStatus,
  to: RequestStatus,
  archivedAt: Date | null,
): Promise<string | null> {
  if (archivedAt) return 'Archived requests cannot be changed by Linear status sync. Restore the request first.'
  const running = await query(
    `SELECT id FROM agent_runs WHERE request_id = $1 AND organization_id = $2
     AND status = 'RUNNING' AND expires_at > clock_timestamp() LIMIT 1`,
    [requestId, organizationId],
  )
  if (running.rowCount) return 'An AI agent is running for this request. Wait for it to finish before syncing status.'
  const exporting = await query(
    `SELECT id FROM tracker_exports WHERE request_id = $1 AND organization_id = $2
     AND lease_token IS NOT NULL AND lease_until > clock_timestamp() LIMIT 1`,
    [requestId, organizationId],
  )
  if (exporting.rowCount) return 'A tracker export is in progress. Retry status synchronization after it finishes.'
  if (to === 'APPROVED' || to === 'REJECTED') {
    try {
      await assertNoApprovalChainBypass(organizationId, from, to === 'APPROVED' ? 'APPROVE' : 'REJECT')
    } catch (error) {
      return error instanceof Error ? error.message : 'The approval workflow rejected this transition.'
    }
    return 'Approval and rejection require an authorized in-app decision.'
  }
  if (!canTransition(from, to)) return `The ${from} to ${to} transition is not allowed by the request lifecycle.`
  if (!SUPPORTED_DELIVERY_EDGES.has(`${from}:${to}`)) {
    return 'Linear status sync only advances supported post-approval delivery stages; intake, assessment, and review remain in VPO.'
  }
  return null
}

export async function applyStatusObservation(observation: Observation): Promise<'APPLIED' | 'SKIPPED' | 'CONFLICT' | 'DEDUPLICATED'> {
  return transaction(async () => {
    const event = await query<{ id: string }>(
      `INSERT INTO tracker_status_events
         (organization_id, provider, destination, remote_entity_id, fingerprint, remote_status_id,
          remote_status_name, mapped_status, remote_updated_at, outcome)
       VALUES ($1, 'LINEAR', $2, $3, $4, $5, $6, $7, $8, 'SKIPPED')
       ON CONFLICT (organization_id, provider, destination, fingerprint) DO NOTHING
       RETURNING id`,
      [observation.organizationId, observation.destination, observation.remoteEntityId, observation.fingerprint,
        observation.remoteStatusId, observation.remoteStatusName, observation.mappedStatus, observation.remoteUpdatedAt],
    )
    if (!event.rowCount) return 'DEDUPLICATED'

    const linked = await query<{
      link_id: string; request_id: string; imported_snapshot: { remoteStatus?: { id?: string | null; name?: string } | null }
      status: RequestStatus; title: string; archived_at: Date | null
    }>(
      `SELECT l.id AS link_id, l.request_id, l.imported_snapshot, r.status, r.title, r.archived_at
       FROM tracker_import_links l
       JOIN feature_requests r ON r.id = l.request_id AND r.organization_id = l.organization_id
       WHERE l.organization_id = $1 AND l.provider = 'LINEAR' AND l.destination = $2 AND l.remote_entity_id = $3
       FOR UPDATE OF l, r`,
      [observation.organizationId, observation.destination, observation.remoteEntityId],
    )
    const row = linked.rows[0]
    if (!row || !observation.remoteStatusName || !observation.mappedStatus) return 'SKIPPED'

    const stateResult = await query<{
      last_remote_status_id: string | null; last_remote_status_name: string | null
      last_remote_updated_at: Date | null; last_synced_local_status: RequestStatus
    }>(`SELECT * FROM tracker_status_link_states WHERE link_id = $1 AND organization_id = $2 FOR UPDATE`, [row.link_id, observation.organizationId])
    const importedRemote = row.imported_snapshot.remoteStatus
    const state = stateResult.rows[0] ?? {
      last_remote_status_id: importedRemote?.id ?? null,
      last_remote_status_name: importedRemote?.name ?? null,
      last_remote_updated_at: null,
      last_synced_local_status: row.status,
    }

    if (state.last_remote_updated_at && observation.remoteUpdatedAt && observation.remoteUpdatedAt <= state.last_remote_updated_at) {
      await query(`UPDATE tracker_status_events SET outcome = 'SKIPPED' WHERE id = $1`, [event.rows[0].id])
      return 'SKIPPED'
    }

    let outcome: 'APPLIED' | 'SKIPPED' | 'CONFLICT' = 'SKIPPED'
    let reason: string | null = null
    if (row.status !== observation.mappedStatus) {
      if (row.status !== state.last_synced_local_status) {
        reason = 'The VPO status changed after the last accepted Linear status.'
      } else {
        reason = await inboundTransitionConflictReason(
          observation.organizationId,
          row.request_id,
          row.status,
          observation.mappedStatus,
          row.archived_at,
        )
      }
      if (reason) {
        outcome = 'CONFLICT'
        await query(
          `INSERT INTO tracker_status_conflicts
             (organization_id, link_id, request_id, remote_status_id, remote_status_name, mapped_status,
              local_status, reason, event_fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (link_id) WHERE resolved_at IS NULL DO UPDATE
           SET remote_status_id = EXCLUDED.remote_status_id, remote_status_name = EXCLUDED.remote_status_name,
               mapped_status = EXCLUDED.mapped_status, local_status = EXCLUDED.local_status,
               reason = EXCLUDED.reason, event_fingerprint = EXCLUDED.event_fingerprint, created_at = clock_timestamp()`,
          [observation.organizationId, row.link_id, row.request_id, observation.remoteStatusId,
            observation.remoteStatusName, observation.mappedStatus, row.status, reason, observation.fingerprint],
        )
      } else {
        const changed = await query(
          `UPDATE feature_requests SET status = $1, updated_at = clock_timestamp()
           WHERE id = $2 AND organization_id = $3 AND status = $4`,
          [observation.mappedStatus, row.request_id, observation.organizationId, row.status],
        )
        if (!changed.rowCount) throw new Error('The request changed while applying the Linear status.')
        const activity = await query(
          `INSERT INTO activity_log (organization_id, request_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'STATUS_CHANGED', 'REQUEST', $2, $3) RETURNING id`,
          [observation.organizationId, row.request_id, { fromStatus: row.status, toStatus: observation.mappedStatus, source: 'LINEAR_STATUS_SYNC' }],
        )
        await enqueueTeamsActivity({ id: activity.rows[0].id, organizationId: observation.organizationId, requestId: row.request_id, action: 'STATUS_CHANGED' })
        outcome = 'APPLIED'
      }
    }

    const syncedLocalStatus = outcome === 'APPLIED' || (outcome === 'SKIPPED' && row.status === observation.mappedStatus)
      ? observation.mappedStatus
      : state.last_synced_local_status
    await query(
      `INSERT INTO tracker_status_link_states
         (link_id, organization_id, last_remote_status_id, last_remote_status_name, last_remote_updated_at, last_synced_local_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (link_id) DO UPDATE
       SET last_remote_status_id = EXCLUDED.last_remote_status_id,
           last_remote_status_name = EXCLUDED.last_remote_status_name,
           last_remote_updated_at = EXCLUDED.last_remote_updated_at,
           last_synced_local_status = EXCLUDED.last_synced_local_status,
           updated_at = clock_timestamp()
       WHERE tracker_status_link_states.organization_id = EXCLUDED.organization_id`,
      [row.link_id, observation.organizationId, observation.remoteStatusId, observation.remoteStatusName,
        observation.remoteUpdatedAt, syncedLocalStatus],
    )
    await query(`UPDATE tracker_status_events SET outcome = $2, error = $3 WHERE id = $1`, [event.rows[0].id, outcome, reason])
    return outcome
  })
}

export async function getStatusSyncOverview(organizationId: string, provider: 'LINEAR', destination: string): Promise<{ config: StatusSyncConfig | null; conflicts: StatusSyncConflict[] }> {
  const [config, conflicts] = await Promise.all([
    getStatusSyncConfig(organizationId, provider, destination),
    query(
      `SELECT c.*, r.title AS request_title FROM tracker_status_conflicts c
       JOIN feature_requests r ON r.id = c.request_id AND r.organization_id = c.organization_id
       WHERE c.organization_id = $1 AND c.resolved_at IS NULL
         AND EXISTS (SELECT 1 FROM tracker_import_links l WHERE l.id = c.link_id AND l.provider = $2 AND l.destination = $3)
       ORDER BY c.created_at DESC`,
      [organizationId, provider, destination],
    ),
  ])
  return { config, conflicts: mapRows<StatusSyncConflict>(conflicts.rows) }
}

export async function resolveStatusSyncConflict(input: {
  organizationId: string
  conflictId: string
  resolution: 'KEEP_LOCAL' | 'APPLY_REMOTE'
  resolvedBy: string
}): Promise<void> {
  await transaction(async () => {
    const conflict = await query<{
      id: string; link_id: string; request_id: string; mapped_status: RequestStatus; local_status: RequestStatus
      remote_status_id: string | null; remote_status_name: string; event_fingerprint: string; status: RequestStatus; archived_at: Date | null
    }>(
      `SELECT c.*, r.status, r.archived_at FROM tracker_status_conflicts c
       JOIN feature_requests r ON r.id = c.request_id AND r.organization_id = c.organization_id
       JOIN organization_users m ON m.organization_id = c.organization_id AND m.user_id = $3 AND m.role = 'ADMIN'
       WHERE c.id = $1 AND c.organization_id = $2 AND c.resolved_at IS NULL
       FOR UPDATE OF c, r`,
      [input.conflictId, input.organizationId, input.resolvedBy],
    )
    const row = conflict.rows[0]
    if (!row) throw new Error('Status conflict not found or insufficient permissions.')
    let finalStatus = row.status
    if (input.resolution === 'APPLY_REMOTE' && row.status !== row.mapped_status) {
      const reason = await inboundTransitionConflictReason(input.organizationId, row.request_id, row.status, row.mapped_status, row.archived_at)
      if (reason) throw new Error(reason)
      await query(`UPDATE feature_requests SET status = $1, updated_at = clock_timestamp() WHERE id = $2 AND organization_id = $3`, [row.mapped_status, row.request_id, input.organizationId])
      const activity = await query(
        `INSERT INTO activity_log (organization_id, request_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, 'STATUS_CHANGED', 'REQUEST', $2, $4) RETURNING id`,
        [input.organizationId, row.request_id, input.resolvedBy, { fromStatus: row.status, toStatus: row.mapped_status, source: 'LINEAR_STATUS_CONFLICT' }],
      )
      await enqueueTeamsActivity({ id: activity.rows[0].id, organizationId: input.organizationId, requestId: row.request_id, action: 'STATUS_CHANGED' })
      finalStatus = row.mapped_status
    }
    await query(
      `UPDATE tracker_status_link_states SET last_synced_local_status = $2, updated_at = clock_timestamp()
       WHERE link_id = $1 AND organization_id = $3`,
      [row.link_id, finalStatus, input.organizationId],
    )
    await query(
      `UPDATE tracker_status_conflicts SET resolved_at = clock_timestamp(), resolution = $2, resolved_by = $3
       WHERE id = $1 AND organization_id = $4`,
      [row.id, input.resolution, input.resolvedBy, input.organizationId],
    )
  })
}
