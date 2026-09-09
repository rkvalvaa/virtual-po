import { query, transaction } from '@/lib/db/pool'
import { mapRow } from '@/lib/db/mappers'
import {
  TRACKER_IMPORT_FIELDS,
  normalizeTrackerImportItem,
  snapshotFromItem,
  trackerValueEqual,
  type TrackerConflictResolution,
  type TrackerImportConflict,
  type TrackerImportField,
  type TrackerImportItem,
  type TrackerImportItemResult,
  type TrackerImportResult,
  type TrackerImportSnapshot,
  type TrackerProvider,
} from '@/lib/import/tracker-imports'

export type { TrackerImportItem } from '@/lib/import/tracker-imports'

export interface TrackerImportContext {
  organizationId: string
  requesterId: string
}

export interface TrackerImportLink {
  id: string
  organizationId: string
  requestId: string
  provider: TrackerProvider
  destination: string
  remoteEntityId: string
  importedSnapshot: TrackerImportSnapshot
  pendingSnapshot: TrackerImportSnapshot | null
  conflictFields: TrackerImportField[]
  createdAt: Date
  updatedAt: Date
}

interface LockedImportRow {
  id: string
  request_id: string
  imported_snapshot: TrackerImportSnapshot
  pending_snapshot: TrackerImportSnapshot | null
  conflict_fields: TrackerImportField[]
  title: string
  summary: string | null
  external_url: string | null
  tags: string[]
  status: string
  human_refined: boolean
  intake_complete: boolean
  archived_at: Date | null
}

async function protectedMutationReason(row: LockedImportRow, organizationId: string): Promise<string | null> {
  if (row.archived_at) return 'Archived requests cannot be overwritten by an import. Restore the request first.'
  const running = await query(
    `SELECT id FROM agent_runs
     WHERE request_id = $1 AND organization_id = $2 AND status = 'RUNNING' AND expires_at > clock_timestamp()
     LIMIT 1`,
    [row.request_id, organizationId],
  )
  if (running.rowCount) return 'An AI agent is running. Wait for it to finish before using tracker content.'
  const exported = await query(
    `SELECT id FROM tracker_exports WHERE request_id = $1 AND organization_id = $2 LIMIT 1`,
    [row.request_id, organizationId],
  )
  if (exported.rowCount) return 'Exported content is frozen and cannot be overwritten by an import.'
  if (row.status === 'APPROVED') return 'Approved content cannot be overwritten by an import. Refine it through the request review flow.'
  if (row.human_refined || row.intake_complete || !['DRAFT', 'INTAKE_IN_PROGRESS'].includes(row.status)) {
    return 'Reviewed or refined content cannot be overwritten by an import. Use the request refinement flow.'
  }
  return null
}

function revisionSnapshot(row: LockedImportRow) {
  return {
    content: { title: row.title, summary: row.summary ?? '' },
    status: row.status,
    externalUrl: row.external_url,
    tags: row.tags ?? [],
  }
}

async function recordTrackerRevision(context: TrackerImportContext, row: LockedImportRow, finalLocal: { title: string; description: string | null; sourceUrl: string | null; labels: string[] }) {
  const before = revisionSnapshot(row)
  const after = {
    content: { title: finalLocal.title, summary: finalLocal.description ?? '' },
    status: row.status,
    externalUrl: finalLocal.sourceUrl,
    tags: finalLocal.labels,
  }
  await query(
    `INSERT INTO request_revisions (request_id, organization_id, author_id, reason, before_snapshot, after_snapshot)
     VALUES ($1, $2, $3, 'Tracker import update', $4, $5)`,
    [row.request_id, context.organizationId, context.requesterId, before, after],
  )
  await query(
    `INSERT INTO activity_log (organization_id, request_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'REQUEST_UPDATED', 'REQUEST', $2, $4)`,
    [context.organizationId, row.request_id, context.requesterId, { reason: 'Tracker import update' }],
  )
}

function localValue(row: LockedImportRow, field: TrackerImportField): string | string[] | null {
  if (field === 'description') return row.summary
  if (field === 'sourceUrl') return row.external_url
  if (field === 'labels') return [...(row.tags ?? [])].sort()
  return row.title
}

function conflictList(row: LockedImportRow, pending: TrackerImportSnapshot | null, fields: TrackerImportField[]): TrackerImportConflict[] {
  if (!pending) return []
  return fields.map(field => ({
    field,
    localValue: localValue(row, field),
    remoteValue: pending[field],
  }))
}

export async function getTrackerImportLink(
  organizationId: string,
  provider: TrackerProvider,
  destination: string,
  remoteEntityId: string,
): Promise<TrackerImportLink | null> {
  const result = await query(
    `SELECT * FROM tracker_import_links
     WHERE organization_id = $1 AND provider = $2 AND destination = $3 AND remote_entity_id = $4`,
    [organizationId, provider, destination, remoteEntityId],
  )
  return result.rows[0] ? mapRow<TrackerImportLink>(result.rows[0]) : null
}

export async function getTrackerImportLinkById(
  organizationId: string,
  linkId: string,
): Promise<TrackerImportLink | null> {
  const result = await query(
    `SELECT * FROM tracker_import_links WHERE organization_id = $1 AND id = $2`,
    [organizationId, linkId],
  )
  return result.rows[0] ? mapRow<TrackerImportLink>(result.rows[0]) : null
}

async function importOne(context: TrackerImportContext, rawItem: TrackerImportItem): Promise<TrackerImportItemResult> {
  const item = normalizeTrackerImportItem(rawItem)
  const remote = snapshotFromItem(item)
  return transaction(async () => {
    const identity = JSON.stringify([context.organizationId, item.provider, item.destination, item.remoteEntityId])
    await query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [identity])
    const existing = await query<LockedImportRow>(
      `SELECT l.id, l.request_id, l.imported_snapshot, l.pending_snapshot, l.conflict_fields,
              r.title, r.summary, r.external_url, r.tags, r.status, r.human_refined, r.intake_complete, r.archived_at
       FROM tracker_import_links l
       JOIN feature_requests r ON r.id = l.request_id AND r.organization_id = l.organization_id
       WHERE l.organization_id = $1 AND l.provider = $2 AND l.destination = $3 AND l.remote_entity_id = $4
       FOR UPDATE OF l, r`,
      [context.organizationId, item.provider, item.destination, item.remoteEntityId],
    )

    if (!existing.rows[0]) {
      const request = await query<{ id: string }>(
        `INSERT INTO feature_requests
           (organization_id, requester_id, title, summary, tags, external_id, external_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [context.organizationId, context.requesterId, remote.title, remote.description, remote.labels, item.remoteEntityId, remote.sourceUrl],
      )
      const link = await query<{ id: string }>(
        `INSERT INTO tracker_import_links
           (organization_id, request_id, provider, destination, remote_entity_id, imported_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [context.organizationId, request.rows[0].id, item.provider, item.destination, item.remoteEntityId, remote],
      )
      return {
        remoteEntityId: item.remoteEntityId,
        displayId: item.displayId,
        outcome: 'created',
        requestId: request.rows[0].id,
        linkId: link.rows[0].id,
        conflicts: [],
      }
    }

    const row = existing.rows[0]
    const accepted = { ...row.imported_snapshot, labels: [...row.imported_snapshot.labels] }
    const finalLocal = {
      title: row.title,
      description: row.summary,
      sourceUrl: row.external_url,
      labels: [...(row.tags ?? [])].sort(),
    }
    const conflictFields: TrackerImportField[] = []
    let changedLocal = false
    const protectionReason = await protectedMutationReason(row, context.organizationId)

    for (const field of TRACKER_IMPORT_FIELDS) {
      const previousValue = accepted[field]
      const remoteValue = remote[field]
      const currentValue = finalLocal[field]
      if (trackerValueEqual(previousValue, remoteValue)) continue
      if (trackerValueEqual(currentValue, remoteValue)) {
        accepted[field] = remoteValue as never
      } else if (trackerValueEqual(currentValue, previousValue) && !protectionReason) {
        finalLocal[field] = remoteValue as never
        accepted[field] = remoteValue as never
        changedLocal = true
      } else {
        conflictFields.push(field)
      }
    }
    accepted.remoteStatus = remote.remoteStatus
    const statusChanged = !trackerValueEqual(row.imported_snapshot.remoteStatus, remote.remoteStatus)
    const pending = conflictFields.length ? remote : null

    if (changedLocal) {
      await query(
        `UPDATE feature_requests
         SET title = $1, summary = $2, external_url = $3, tags = $4, updated_at = NOW()
         WHERE id = $5 AND organization_id = $6`,
        [finalLocal.title, finalLocal.description, finalLocal.sourceUrl, finalLocal.labels, row.request_id, context.organizationId],
      )
      await recordTrackerRevision(context, row, finalLocal)
    }
    const linkChanged = !trackerValueEqual(row.imported_snapshot, accepted) || statusChanged || !trackerValueEqual(row.conflict_fields, conflictFields) || !trackerValueEqual(row.pending_snapshot, pending)
    if (linkChanged) {
      await query(
        `UPDATE tracker_import_links
         SET imported_snapshot = $1, pending_snapshot = $2, conflict_fields = $3, updated_at = NOW()
         WHERE id = $4 AND organization_id = $5`,
        [accepted, pending, conflictFields, row.id, context.organizationId],
      )
    }
    const lockedRow: LockedImportRow = {
      ...row,
      title: finalLocal.title,
      summary: finalLocal.description,
      external_url: finalLocal.sourceUrl,
      tags: finalLocal.labels,
    }
    return {
      remoteEntityId: item.remoteEntityId,
      displayId: item.displayId,
      outcome: changedLocal || statusChanged ? 'updated' : 'skipped',
      requestId: row.request_id,
      linkId: row.id,
      conflicts: conflictList(lockedRow, pending, conflictFields),
    }
  })
}

export async function importTrackerItems(context: TrackerImportContext, items: TrackerImportItem[]): Promise<TrackerImportResult> {
  const result: TrackerImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, items: [] }
  for (const item of items) {
    try {
      const imported = await importOne(context, item)
      result[imported.outcome] += 1
      result.items.push(imported)
    } catch (error) {
      result.failed += 1
      result.items.push({
        remoteEntityId: item.remoteEntityId,
        displayId: item.displayId,
        outcome: 'failed',
        conflicts: [],
        error: error instanceof Error ? error.message : 'Import failed.',
      })
    }
  }
  return result
}

export async function resolveTrackerImportConflict(
  context: TrackerImportContext,
  linkId: string,
  resolutions: Partial<Record<TrackerImportField, TrackerConflictResolution>>,
): Promise<TrackerImportItemResult> {
  return transaction(async () => {
    const result = await query<LockedImportRow & { remote_entity_id: string }>(
      `SELECT l.id, l.request_id, l.remote_entity_id, l.imported_snapshot, l.pending_snapshot, l.conflict_fields,
              r.title, r.summary, r.external_url, r.tags, r.status, r.human_refined, r.intake_complete, r.archived_at
       FROM tracker_import_links l
       JOIN feature_requests r ON r.id = l.request_id AND r.organization_id = l.organization_id
       WHERE l.id = $1 AND l.organization_id = $2
       FOR UPDATE OF l, r`,
      [linkId, context.organizationId],
    )
    const row = result.rows[0]
    if (!row) throw new Error('Import link not found.')
    if (!row.pending_snapshot || row.conflict_fields.length === 0) {
      return { remoteEntityId: row.remote_entity_id, outcome: 'skipped', requestId: row.request_id, linkId: row.id, conflicts: [] }
    }

    const accepted = { ...row.imported_snapshot, labels: [...row.imported_snapshot.labels] }
    const finalLocal = {
      title: row.title,
      description: row.summary,
      sourceUrl: row.external_url,
      labels: [...(row.tags ?? [])].sort(),
    }
    const remaining: TrackerImportField[] = []
    let changedLocal = false
    const protectionReason = await protectedMutationReason(row, context.organizationId)
    for (const field of row.conflict_fields) {
      const resolution = resolutions[field]
      if (!resolution) {
        remaining.push(field)
        continue
      }
      const remoteValue = row.pending_snapshot[field]
      if (resolution === 'REMOTE') {
        if (!trackerValueEqual(finalLocal[field], remoteValue) && protectionReason) throw new Error(protectionReason)
        changedLocal ||= !trackerValueEqual(finalLocal[field], remoteValue)
        finalLocal[field] = remoteValue as never
      }
      accepted[field] = remoteValue as never
    }

    if (changedLocal) {
      await query(
        `UPDATE feature_requests
         SET title = $1, summary = $2, external_url = $3, tags = $4, updated_at = NOW()
         WHERE id = $5 AND organization_id = $6`,
        [finalLocal.title, finalLocal.description, finalLocal.sourceUrl, finalLocal.labels, row.request_id, context.organizationId],
      )
      await recordTrackerRevision(context, row, finalLocal)
    }
    await query(
      `UPDATE tracker_import_links
       SET imported_snapshot = $1, pending_snapshot = $2, conflict_fields = $3, updated_at = NOW()
       WHERE id = $4 AND organization_id = $5`,
      [accepted, remaining.length ? row.pending_snapshot : null, remaining, row.id, context.organizationId],
    )
    const finalRow: LockedImportRow = {
      ...row,
      title: finalLocal.title,
      summary: finalLocal.description,
      external_url: finalLocal.sourceUrl,
      tags: finalLocal.labels,
    }
    return {
      remoteEntityId: row.remote_entity_id,
      outcome: changedLocal ? 'updated' : 'skipped',
      requestId: row.request_id,
      linkId: row.id,
      conflicts: conflictList(finalRow, remaining.length ? row.pending_snapshot : null, remaining),
    }
  })
}
