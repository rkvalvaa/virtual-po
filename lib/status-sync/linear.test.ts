// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { importTrackerItems } from '@/lib/db/queries/tracker-imports'
import { getStatusSyncOverview, listDueStatusSyncConfigs, upsertStatusSyncConfig } from '@/lib/db/queries/tracker-status-sync'
import { isLinearReconciliationDue, pollLinearStatuses, reconcileLinearStatuses, resolveLinearStatusConflict } from './linear'
import type { LinearStatusSyncClient } from './types'

function issue(id: string, stateId: string, stateName: string, updatedAt = '2026-09-09T08:00:00.000Z') {
  return {
    id,
    identifier: `ENG-${id}`,
    title: 'Linked issue',
    description: null,
    url: `https://linear.app/acme/issue/${id}`,
    state: { id: stateId, name: stateName },
    priority: 3,
    project: null,
    labels: { nodes: [] },
    updatedAt,
  }
}

describe.skipIf(!hasDb())('Linear status synchronization (CCT-2074)', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let user: TestUser
  let otherUser: TestUser

  beforeAll(async () => {
    org = await createTestOrg('linear-status-sync')
    otherOrg = await createTestOrg('linear-status-sync-other')
    user = await createTestUser(org, 'ADMIN')
    otherUser = await createTestUser(otherOrg, 'ADMIN')
  })

  afterAll(async () => {
    await cleanupTestOrg(otherOrg, [otherUser.id])
    await cleanupTestOrg(org, [user.id])
  })

  async function link(remoteEntityId: string, targetOrg = org, targetUser = user, status = 'IN_BACKLOG') {
    const imported = await importTrackerItems(
      { organizationId: targetOrg.id, requesterId: targetUser.id },
      [{
        provider: 'LINEAR', destination: 'team-1', remoteEntityId,
        title: 'Linked issue', description: null,
        sourceUrl: `https://linear.app/acme/issue/${remoteEntityId}`,
        labels: [], remoteStatus: { id: 'todo', name: 'Todo' },
      }],
    )
    await query(`UPDATE feature_requests SET status = $1 WHERE id = $2`, [status, imported.items[0].requestId])
    return { requestId: imported.items[0].requestId!, linkId: imported.items[0].linkId! }
  }

  async function configure(targetOrg = org) {
    return upsertStatusSyncConfig({
      organizationId: targetOrg.id,
      provider: 'LINEAR',
      destination: 'team-1',
      enabled: true,
      mappings: [
        { remoteStatusId: 'started', remoteStatusName: 'Started', targetStatus: 'IN_PROGRESS' },
        { remoteStatusId: 'done', remoteStatusName: 'Done', targetStatus: 'COMPLETED' },
        { remoteStatusId: 'approved', remoteStatusName: 'Approved', targetStatus: 'APPROVED' },
      ],
      updatedBy: user.id,
    })
  }

  it('polls every page, applies an allowed lifecycle transition, and deduplicates an overlapping event', async () => {
    const linked = await link('poll-safe')
    await configure()
    const listUpdatedIssuesPage = vi.fn()
      .mockResolvedValueOnce({ items: [issue('poll-safe', 'started', 'Started')], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ items: [issue('unlinked', 'started', 'Started')], nextCursor: null })
    const client: LinearStatusSyncClient = { listUpdatedIssuesPage, getIssue: vi.fn() }

    const first = await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T09:00:00Z') })
    expect(first).toMatchObject({ applied: 1, conflicts: 0, failed: 0 })
    expect(listUpdatedIssuesPage).toHaveBeenNthCalledWith(2, 'team-1', expect.any(Date), { cursor: 'page-2', pageSize: 50 })
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [linked.requestId])).rows[0].status).toBe('IN_PROGRESS')

    listUpdatedIssuesPage.mockReset()
    listUpdatedIssuesPage.mockResolvedValue({ items: [issue('poll-safe', 'started', 'Started')], nextCursor: null })
    const repeat = await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T09:05:00Z') })
    expect(repeat).toMatchObject({ applied: 0, deduplicated: 1 })
    const events = await query(`SELECT * FROM tracker_status_events WHERE organization_id = $1 AND remote_entity_id = 'poll-safe'`, [org.id])
    expect(events.rows).toHaveLength(1)
    const overview = await getStatusSyncOverview(org.id, 'LINEAR', 'team-1')
    expect(overview.config?.checkpointAt?.toISOString()).toBe('2026-09-09T09:05:00.000Z')
    expect(overview.config?.lastError).toBeNull()
  })

  it('preserves a later local edit and exposes a conflict for explicit resolution', async () => {
    const linked = await link('local-conflict')
    await configure()
    const client: LinearStatusSyncClient = {
      listUpdatedIssuesPage: vi.fn().mockResolvedValue({ items: [issue('local-conflict', 'started', 'Started')], nextCursor: null }),
      getIssue: vi.fn(),
    }
    await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T09:00:00Z') })
    await query(`UPDATE feature_requests SET status = 'IN_BACKLOG' WHERE id = $1`, [linked.requestId])
    vi.mocked(client.listUpdatedIssuesPage).mockResolvedValue({ items: [issue('local-conflict', 'done', 'Done', '2026-09-09T09:10:00Z')], nextCursor: null })

    const result = await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T09:15:00Z') })
    expect(result).toMatchObject({ applied: 0, conflicts: 1 })
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [linked.requestId])).rows[0].status).toBe('IN_BACKLOG')
    const overview = await getStatusSyncOverview(org.id, 'LINEAR', 'team-1')
    expect(overview.conflicts[0]).toMatchObject({ requestId: linked.requestId, localStatus: 'IN_BACKLOG', mappedStatus: 'COMPLETED' })

    await query(`UPDATE feature_requests SET status = 'IN_PROGRESS' WHERE id = $1`, [linked.requestId])
    await resolveLinearStatusConflict({ organizationId: org.id, conflictId: overview.conflicts[0].id, resolution: 'APPLY_REMOTE', resolvedBy: user.id })
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [linked.requestId])).rows[0].status).toBe('COMPLETED')
    expect((await getStatusSyncOverview(org.id, 'LINEAR', 'team-1')).conflicts).toHaveLength(0)
  })

  it('never bypasses an in-app approval decision', async () => {
    const linked = await link('approval-guard', org, user, 'UNDER_REVIEW')
    await configure()
    const client: LinearStatusSyncClient = {
      listUpdatedIssuesPage: vi.fn().mockResolvedValue({ items: [issue('approval-guard', 'approved', 'Approved')], nextCursor: null }),
      getIssue: vi.fn(),
    }
    await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T10:00:00Z') })
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [linked.requestId])).rows[0].status).toBe('UNDER_REVIEW')
    const conflict = (await getStatusSyncOverview(org.id, 'LINEAR', 'team-1')).conflicts[0]
    expect(conflict.reason).toMatch(/decision/i)
    await expect(resolveLinearStatusConflict({ organizationId: org.id, conflictId: conflict.id, resolution: 'APPLY_REMOTE', resolvedBy: user.id })).rejects.toThrow(/decision/i)
  })

  it('keeps identical Linear IDs isolated by organization', async () => {
    const own = await link('shared-id')
    const foreign = await link('shared-id', otherOrg, otherUser)
    await configure()
    const client: LinearStatusSyncClient = {
      listUpdatedIssuesPage: vi.fn().mockResolvedValue({ items: [issue('shared-id', 'started', 'Started')], nextCursor: null }),
      getIssue: vi.fn(),
    }
    await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T11:00:00Z') })
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [own.requestId])).rows[0].status).toBe('IN_PROGRESS')
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [foreign.requestId])).rows[0].status).toBe('IN_BACKLOG')
  })

  it('reconciles missed updates by reading every linked issue directly', async () => {
    const linked = await link('missed-event')
    await configure()
    const client: LinearStatusSyncClient = {
      listUpdatedIssuesPage: vi.fn(),
      getIssue: vi.fn().mockResolvedValue(issue('missed-event', 'started', 'Started', '2026-09-08T12:00:00Z')),
    }
    const result = await reconcileLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T12:00:00Z') })
    expect(result.applied).toBe(1)
    expect(client.getIssue).toHaveBeenCalledWith('missed-event')
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [linked.requestId])).rows[0].status).toBe('IN_PROGRESS')
    expect((await getStatusSyncOverview(org.id, 'LINEAR', 'team-1')).config?.lastReconciledAt?.toISOString()).toBe('2026-09-09T12:00:00.000Z')
  })

  it('runs reconciliation by elapsed time rather than a narrow wall-clock window', () => {
    expect(isLinearReconciliationDue(null, new Date('2026-09-09T03:05:00Z'))).toBe(true)
    expect(isLinearReconciliationDue(new Date('2026-09-08T03:01:00Z'), new Date('2026-09-09T03:05:00Z'))).toBe(true)
    expect(isLinearReconciliationDue(new Date('2026-09-09T02:00:00Z'), new Date('2026-09-09T03:05:00Z'))).toBe(false)
  })

  it('records visible credential errors with a bounded retry counter', async () => {
    await upsertStatusSyncConfig({
      organizationId: org.id, provider: 'LINEAR', destination: 'revoked-team', enabled: true,
      mappings: [{ remoteStatusId: 'started', remoteStatusName: 'Started', targetStatus: 'IN_PROGRESS' }], updatedBy: user.id,
    })
    const client: LinearStatusSyncClient = {
      listUpdatedIssuesPage: vi.fn().mockRejectedValue(new Error('Linear credentials were revoked.')),
      getIssue: vi.fn(),
    }
    for (let attempt = 0; attempt < 7; attempt += 1) {
      await expect(pollLinearStatuses({ organizationId: org.id, destination: 'revoked-team', client, now: new Date(2026, 8, 9, 12, attempt) })).rejects.toThrow(/revoked/i)
    }
    const config = (await getStatusSyncOverview(org.id, 'LINEAR', 'revoked-team')).config
    expect(config).toMatchObject({ failureCount: 5, lastError: 'Linear credentials were revoked.' })
    expect(config!.nextAttemptAt.valueOf()).toBeGreaterThan(new Date(2026, 8, 9, 12, 6).valueOf())
  })

  it('ignores an older provider observation that arrives after a newer status', async () => {
    const linked = await link('out-of-order')
    await upsertStatusSyncConfig({
      organizationId: org.id, provider: 'LINEAR', destination: 'team-1', enabled: true, updatedBy: user.id,
      mappings: [
        { remoteStatusId: 'started', remoteStatusName: 'Started', targetStatus: 'IN_PROGRESS' },
        { remoteStatusId: 'todo', remoteStatusName: 'Todo', targetStatus: 'IN_BACKLOG' },
      ],
    })
    const client: LinearStatusSyncClient = { listUpdatedIssuesPage: vi.fn(), getIssue: vi.fn() }
    vi.mocked(client.listUpdatedIssuesPage).mockResolvedValueOnce({ items: [issue('out-of-order', 'started', 'Started', '2026-09-09T12:10:00Z')], nextCursor: null })
    await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T12:11:00Z') })
    vi.mocked(client.listUpdatedIssuesPage).mockResolvedValueOnce({ items: [issue('out-of-order', 'todo', 'Todo', '2026-09-09T12:05:00Z')], nextCursor: null })
    await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T12:12:00Z') })
    expect((await query(`SELECT status FROM feature_requests WHERE id = $1`, [linked.requestId])).rows[0].status).toBe('IN_PROGRESS')
  })

  it('claims each due configuration once across concurrent cron sweeps', async () => {
    const config = await upsertStatusSyncConfig({
      organizationId: org.id, provider: 'LINEAR', destination: 'claim-team', enabled: true, updatedBy: user.id,
      mappings: [{ remoteStatusId: 'started', remoteStatusName: 'Started', targetStatus: 'IN_PROGRESS' }],
    })
    await query(`UPDATE tracker_status_sync_configs SET next_attempt_at = '2026-09-09T12:00:00Z' WHERE id = $1`, [config.id])
    const claimed = (await Promise.all([
      listDueStatusSyncConfigs(new Date('2026-09-09T12:01:00Z')),
      listDueStatusSyncConfigs(new Date('2026-09-09T12:01:00Z')),
    ])).flat().filter(item => item.id === config.id)
    expect(claimed).toHaveLength(1)
  })

  it.each([
    ['unfinished intake', 'PENDING_ASSESSMENT', async () => undefined],
    ['active agent', 'IN_PROGRESS', async (requestId: string) => query(`INSERT INTO agent_runs(request_id,organization_id,user_id,agent) VALUES($1,$2,$3,'assessment')`, [requestId, org.id, user.id])],
    ['active export lease', 'IN_PROGRESS', async (requestId: string) => query(`INSERT INTO tracker_exports(request_id,organization_id,provider,destination,items,lease_token,lease_until) VALUES($1,$2,'LINEAR','team-1','[]',gen_random_uuid(),clock_timestamp()+interval '2 minutes')`, [requestId, org.id])],
    ['archived request', 'IN_PROGRESS', async (requestId: string) => query(`UPDATE feature_requests SET archived_at=clock_timestamp(),archived_by=$2 WHERE id=$1`, [requestId, user.id])],
  ])('refuses a status change during %s', async (_label, targetStatus, arrange) => {
    const remoteEntityId = `guard-${_label}`
    const linked = await link(remoteEntityId, org, user, _label === 'unfinished intake' ? 'INTAKE_IN_PROGRESS' : 'IN_BACKLOG')
    await arrange(linked.requestId)
    await upsertStatusSyncConfig({
      organizationId: org.id, provider: 'LINEAR', destination: 'team-1', enabled: true, updatedBy: user.id,
      mappings: [{ remoteStatusId: 'guarded', remoteStatusName: 'Guarded', targetStatus: targetStatus as 'PENDING_ASSESSMENT' | 'IN_PROGRESS' }],
    })
    const client: LinearStatusSyncClient = {
      listUpdatedIssuesPage: vi.fn().mockResolvedValue({ items: [issue(remoteEntityId, 'guarded', 'Guarded', '2026-09-09T13:00:00Z')], nextCursor: null }),
      getIssue: vi.fn(),
    }
    const result = await pollLinearStatuses({ organizationId: org.id, destination: 'team-1', client, now: new Date('2026-09-09T13:01:00Z') })
    expect(result.conflicts).toBe(1)
    expect((await query(`SELECT status FROM feature_requests WHERE id=$1`, [linked.requestId])).rows[0].status).toBe(_label === 'unfinished intake' ? 'INTAKE_IN_PROGRESS' : 'IN_BACKLOG')
  })
})
