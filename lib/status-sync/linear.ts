import { createHash } from 'node:crypto'
import { getIntegrationByType } from '@/lib/db/queries/jira-sync'
import { getLinearClientFromIntegration } from '@/lib/linear/client'
import {
  applyStatusObservation,
  getStatusSyncConfig,
  listDueStatusSyncConfigs,
  listLinearImportLinks,
  recordStatusSyncFailure,
  recordStatusReconcileSuccess,
  recordStatusSyncSuccess,
  resolveStatusSyncConflict,
  type StatusSyncConfig,
} from '@/lib/db/queries/tracker-status-sync'
import type { LinearStatusSyncClient, StatusMapping, StatusSyncResult } from './types'

const emptyResult = (): StatusSyncResult => ({ observed: 0, applied: 0, skipped: 0, conflicts: 0, failed: 0, deduplicated: 0 })

export function isLinearReconciliationDue(lastReconciledAt: Date | null, now: Date): boolean {
  return !lastReconciledAt || now.valueOf() - lastReconciledAt.valueOf() >= 24 * 60 * 60_000
}

function eventFingerprint(input: {
  organizationId: string; destination: string; remoteEntityId: string
  remoteStatusId: string | null; remoteStatusName: string | null; updatedAt: string | null; mappedStatus: string | null
}) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function mappingFor(mappings: StatusMapping[], status: { id: string; name: string } | null) {
  if (!status) return null
  return mappings.find(mapping => mapping.remoteStatusId === status.id) ?? null
}

async function observe(
  config: StatusSyncConfig,
  issue: Awaited<ReturnType<LinearStatusSyncClient['getIssue']>>,
  result: StatusSyncResult,
) {
  result.observed += 1
  const mapping = mappingFor(config.mappings, issue.state)
  const remoteUpdatedAt = issue.updatedAt ? new Date(issue.updatedAt) : null
  const fingerprint = eventFingerprint({
    organizationId: config.organizationId,
    destination: config.destination,
    remoteEntityId: issue.id,
    remoteStatusId: issue.state?.id ?? null,
    remoteStatusName: issue.state?.name ?? null,
    updatedAt: issue.updatedAt ?? null,
    mappedStatus: mapping?.targetStatus ?? null,
  })
  const outcome = await applyStatusObservation({
    organizationId: config.organizationId,
    destination: config.destination,
    remoteEntityId: issue.id,
    remoteStatusId: issue.state?.id ?? null,
    remoteStatusName: issue.state?.name ?? null,
    remoteUpdatedAt: remoteUpdatedAt && !Number.isNaN(remoteUpdatedAt.valueOf()) ? remoteUpdatedAt : null,
    mappedStatus: mapping?.targetStatus ?? null,
    fingerprint,
  })
  if (outcome === 'APPLIED') result.applied += 1
  else if (outcome === 'CONFLICT') result.conflicts += 1
  else if (outcome === 'DEDUPLICATED') result.deduplicated += 1
  else result.skipped += 1
}

async function requireConfig(organizationId: string, destination: string) {
  const config = await getStatusSyncConfig(organizationId, 'LINEAR', destination)
  if (!config) throw new Error('Linear status sync is not configured for this team.')
  return config
}

export async function pollLinearStatuses(input: {
  organizationId: string
  destination: string
  client: LinearStatusSyncClient
  now?: Date
}): Promise<StatusSyncResult> {
  const now = input.now ?? new Date()
  const config = await requireConfig(input.organizationId, input.destination)
  if (!config.enabled) throw new Error('Linear status sync is disabled for this team.')
  const result = emptyResult()
  const updatedAfter = new Date((config.checkpointAt?.valueOf() ?? now.valueOf() - 15 * 60_000) - (config.checkpointAt ? 5 * 60_000 : 0))
  let cursor: string | null = null
  let pages = 0
  try {
    do {
      const page = await input.client.listUpdatedIssuesPage(config.destination, updatedAfter, { cursor, pageSize: 50 })
      for (const issue of page.items) {
        try { await observe(config, issue, result) }
        catch { result.failed += 1 }
      }
      cursor = page.nextCursor
      pages += 1
      if (pages >= 100 && cursor) throw new Error('Linear pagination exceeded the safe polling limit.')
    } while (cursor)
    if (result.failed) throw new Error(`${result.failed} Linear status event${result.failed === 1 ? '' : 's'} could not be applied.`)
    await recordStatusSyncSuccess(config.id, now, now)
    return result
  } catch (error) {
    await recordStatusSyncFailure(config.id, error instanceof Error ? error.message : 'Linear status polling failed.', now)
    throw error
  }
}

export async function reconcileLinearStatuses(input: {
  organizationId: string
  destination: string
  client: LinearStatusSyncClient
  now?: Date
}): Promise<StatusSyncResult> {
  const now = input.now ?? new Date()
  const config = await requireConfig(input.organizationId, input.destination)
  const result = emptyResult()
  const links = await listLinearImportLinks(input.organizationId, input.destination)
  let lastError: unknown = null
  for (const link of links) {
    try {
      const issue = await input.client.getIssue(link.remoteEntityId)
      await observe(config, issue, result)
    } catch (error) {
      result.failed += 1
      lastError = error
    }
  }
  if (lastError) {
    await recordStatusSyncFailure(config.id, lastError instanceof Error ? lastError.message : 'Linear reconciliation failed.', now)
  } else {
    await recordStatusReconcileSuccess(config.id, now)
  }
  return result
}

export async function resolveLinearStatusConflict(input: {
  organizationId: string
  conflictId: string
  resolution: 'KEEP_LOCAL' | 'APPLY_REMOTE'
  resolvedBy: string
}): Promise<void> {
  return resolveStatusSyncConflict(input)
}

export async function runDueLinearStatusSyncs(now = new Date()): Promise<Array<{ configId: string; success: boolean; error?: string }>> {
  const configs = await listDueStatusSyncConfigs(now)
  const outcomes: Array<{ configId: string; success: boolean; error?: string }> = []
  for (const config of configs) {
    let pollingStarted = false
    try {
      const integration = await getIntegrationByType(config.organizationId, 'LINEAR')
      if (!integration) throw new Error('Linear credentials are unavailable or revoked. Reconnect Linear in Settings.')
      const client = getLinearClientFromIntegration(integration)
      pollingStarted = true
      await pollLinearStatuses({ organizationId: config.organizationId, destination: config.destination, client, now })
      // Once daily, compare every linked issue directly so an update omitted by
      // Linear's incremental window is eventually repaired. Fingerprints make
      // this safe when an event was already seen by the regular poll.
      if (isLinearReconciliationDue(config.lastReconciledAt, now)) {
        const reconciliation = await reconcileLinearStatuses({ organizationId: config.organizationId, destination: config.destination, client, now })
        if (reconciliation.failed) throw new Error(`${reconciliation.failed} linked Linear issue${reconciliation.failed === 1 ? '' : 's'} could not be reconciled.`)
      }
      outcomes.push({ configId: config.id, success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Linear status polling failed.'
      // pollLinearStatuses records provider failures itself; setup failures happen before it is called.
      if (!pollingStarted) await recordStatusSyncFailure(config.id, message, now)
      outcomes.push({ configId: config.id, success: false, error: message })
    }
  }
  return outcomes
}
