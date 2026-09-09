// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import {
  getTrackerImportLink,
  importTrackerItems,
  resolveTrackerImportConflict,
  type TrackerImportItem,
} from './tracker-imports'

const linearItem = (overrides: Partial<TrackerImportItem> = {}): TrackerImportItem => ({
  provider: 'LINEAR',
  destination: 'team-stable-id',
  remoteEntityId: 'issue-stable-id',
  title: 'Remote title',
  description: 'Full remote description',
  sourceUrl: 'https://linear.app/acme/issue/ENG-42',
  labels: ['customer', 'urgent'],
  remoteStatus: { id: 'state-1', name: 'In Progress' },
  ...overrides,
})

describe.skipIf(!hasDb())('tracker import reconciliation (CCT-2068)', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let user: TestUser
  let otherUser: TestUser

  beforeAll(async () => {
    org = await createTestOrg('tracker-import')
    otherOrg = await createTestOrg('tracker-import-other')
    user = await createTestUser(org, 'REVIEWER')
    otherUser = await createTestUser(otherOrg, 'REVIEWER')
  })

  afterAll(async () => {
    await cleanupTestOrg(otherOrg, [otherUser.id])
    await cleanupTestOrg(org, [user.id])
  })

  it('maps complete tracker context and skips an unchanged repeat', async () => {
    const item = linearItem({ remoteEntityId: 'complete-context' })
    const first = await importTrackerItems({ organizationId: org.id, requesterId: user.id }, [item])
    expect(first.items[0].error).toBeUndefined()
    expect(first).toMatchObject({ created: 1, updated: 0, skipped: 0, failed: 0 })

    const request = await query(
      `SELECT title, summary, external_url, tags FROM feature_requests WHERE id = $1`,
      [first.items[0].requestId],
    )
    expect(request.rows[0]).toEqual({
      title: 'Remote title',
      summary: 'Full remote description',
      external_url: 'https://linear.app/acme/issue/ENG-42',
      tags: ['customer', 'urgent'],
    })
    const link = await getTrackerImportLink(org.id, 'LINEAR', 'team-stable-id', 'complete-context')
    expect(link).toMatchObject({
      requestId: first.items[0].requestId,
      provider: 'LINEAR',
      destination: 'team-stable-id',
      remoteEntityId: 'complete-context',
      importedSnapshot: {
        title: 'Remote title',
        description: 'Full remote description',
        sourceUrl: 'https://linear.app/acme/issue/ENG-42',
        labels: ['customer', 'urgent'],
        remoteStatus: { id: 'state-1', name: 'In Progress' },
      },
    })

    const repeat = await importTrackerItems({ organizationId: org.id, requesterId: user.id }, [item])
    expect(repeat).toMatchObject({ created: 0, updated: 0, skipped: 1, failed: 0 })
    expect(repeat.items[0].requestId).toBe(first.items[0].requestId)
  })

  it('converges concurrent repeated imports on one local request', async () => {
    const item = linearItem({ remoteEntityId: 'concurrent-id' })
    const results = await Promise.all(
      Array.from({ length: 5 }, () => importTrackerItems({ organizationId: org.id, requesterId: user.id }, [item])),
    )
    expect(new Set(results.map(result => result.items[0].requestId))).toHaveProperty('size', 1)
    const rows = await query(
      `SELECT request_id FROM tracker_import_links
       WHERE organization_id = $1 AND provider = 'LINEAR' AND destination = $2 AND remote_entity_id = $3`,
      [org.id, item.destination, item.remoteEntityId],
    )
    expect(rows.rows).toHaveLength(1)
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1)
  })

  it('keeps reused provider IDs isolated by organization and destination', async () => {
    const remoteEntityId = 'reused-remote-id'
    const [sameOrgA, sameOrgB, foreign] = await Promise.all([
      importTrackerItems({ organizationId: org.id, requesterId: user.id }, [linearItem({ destination: 'team-a', remoteEntityId })]),
      importTrackerItems({ organizationId: org.id, requesterId: user.id }, [linearItem({ destination: 'team-b', remoteEntityId })]),
      importTrackerItems({ organizationId: otherOrg.id, requesterId: otherUser.id }, [linearItem({ destination: 'team-a', remoteEntityId })]),
    ])
    expect(new Set([sameOrgA.items[0].requestId, sameOrgB.items[0].requestId, foreign.items[0].requestId])).toHaveProperty('size', 3)
  })

  it('does not alias the same Jira issue and project IDs across remote sites in one organization', async () => {
    const base = linearItem({ provider: 'JIRA', remoteEntityId: 'jira-global-looking-id' })
    const [first, second] = await Promise.all([
      importTrackerItems({ organizationId: org.id, requesterId: user.id }, [{ ...base, destination: 'https://alpha.atlassian.net|project-100' }]),
      importTrackerItems({ organizationId: org.id, requesterId: user.id }, [{ ...base, destination: 'https://beta.atlassian.net|project-100' }]),
    ])
    expect(first.items[0].requestId).not.toBe(second.items[0].requestId)
  })

  it('updates clean local fields when remote content changes', async () => {
    const remoteEntityId = 'clean-update'
    const first = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId })],
    )
    const updated = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId, title: 'Renamed remotely', labels: ['customer', 'planned'], remoteStatus: { id: 'state-2', name: 'Done' } })],
    )
    expect(updated).toMatchObject({ created: 0, updated: 1, skipped: 0, failed: 0 })
    const request = await query(`SELECT title, tags FROM feature_requests WHERE id = $1`, [first.items[0].requestId])
    expect(request.rows[0]).toEqual({ title: 'Renamed remotely', tags: ['customer', 'planned'] })
    const link = await getTrackerImportLink(org.id, 'LINEAR', 'team-stable-id', remoteEntityId)
    expect(link?.importedSnapshot.remoteStatus).toEqual({ id: 'state-2', name: 'Done' })
  })

  it('persists a newly accepted baseline when local content already equals the remote update', async () => {
    const remoteEntityId = 'already-equal'
    const first = await importTrackerItems({ organizationId: org.id, requesterId: user.id }, [linearItem({ remoteEntityId })])
    await query(`UPDATE feature_requests SET title = 'Already reconciled' WHERE id = $1`, [first.items[0].requestId])
    const result = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId, title: 'Already reconciled' })],
    )
    expect(result.items[0].conflicts).toEqual([])
    expect((await getTrackerImportLink(org.id, 'LINEAR', 'team-stable-id', remoteEntityId))?.importedSnapshot.title).toBe('Already reconciled')
  })

  it.each([
    ['approved', async (requestId: string) => query(`UPDATE feature_requests SET status = 'APPROVED' WHERE id = $1`, [requestId])],
    ['exported', async (requestId: string) => query(`INSERT INTO tracker_exports (request_id, organization_id, provider, destination, items) VALUES ($1, $2, 'LINEAR', 'team-stable-id', '[]')`, [requestId, org.id])],
    ['active AI run', async (requestId: string) => query(`INSERT INTO agent_runs (request_id, organization_id, user_id, agent) VALUES ($1, $2, $3, 'intake')`, [requestId, org.id, user.id])],
    ['archived', async (requestId: string) => query(`UPDATE feature_requests SET archived_at=clock_timestamp(),archived_by=$2 WHERE id=$1`, [requestId, user.id])],
  ])('keeps remote content pending while a request is %s', async (_label, protect) => {
    const remoteEntityId = `protected-${_label}`
    const first = await importTrackerItems({ organizationId: org.id, requesterId: user.id }, [linearItem({ remoteEntityId })])
    const requestId = first.items[0].requestId!
    await protect(requestId)
    const result = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId, title: 'Remote protected edit', description: 'Remote protected body' })],
    )
    expect(result.items[0].conflicts.map(conflict => conflict.field)).toEqual(['title', 'description'])
    expect((await query(`SELECT title, summary FROM feature_requests WHERE id = $1`, [requestId])).rows[0]).toEqual({ title: 'Remote title', summary: 'Full remote description' })
    await expect(resolveTrackerImportConflict(
      { organizationId: org.id, requesterId: user.id },
      result.items[0].linkId!,
      { title: 'REMOTE' },
    )).rejects.toThrow(/cannot (?:be )?overwrite|agent|export|approved|archived/i)
  })

  it('persists local-edit conflicts and requires explicit per-field resolution', async () => {
    const remoteEntityId = 'local-conflict'
    const first = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId })],
    )
    const requestId = first.items[0].requestId!
    await query(`UPDATE feature_requests SET title = 'Locally edited title', summary = 'Locally edited description' WHERE id = $1`, [requestId])

    const conflict = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId, title: 'New tracker title', description: 'New tracker description', labels: ['new-label'] })],
    )
    expect(conflict).toMatchObject({ created: 0, updated: 1, skipped: 0, failed: 0 })
    expect(conflict.items[0].conflicts).toEqual([
      { field: 'title', localValue: 'Locally edited title', remoteValue: 'New tracker title' },
      { field: 'description', localValue: 'Locally edited description', remoteValue: 'New tracker description' },
    ])
    let row = await query(`SELECT title, summary, tags FROM feature_requests WHERE id = $1`, [requestId])
    expect(row.rows[0]).toEqual({ title: 'Locally edited title', summary: 'Locally edited description', tags: ['new-label'] })

    const linkId = conflict.items[0].linkId!
    const resolved = await resolveTrackerImportConflict(
      { organizationId: org.id, requesterId: user.id },
      linkId,
      { title: 'REMOTE', description: 'LOCAL' },
    )
    expect(resolved.conflicts).toEqual([])
    row = await query(`SELECT title, summary FROM feature_requests WHERE id = $1`, [requestId])
    expect(row.rows[0]).toEqual({ title: 'New tracker title', summary: 'Locally edited description' })

    const repeat = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId, title: 'New tracker title', description: 'New tracker description', labels: ['new-label'] })],
    )
    expect(repeat).toMatchObject({ skipped: 1, failed: 0 })
    expect(repeat.items[0].conflicts).toEqual([])
  })

  it('cannot resolve a conflict through another organization', async () => {
    const first = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId: 'tenant-resolution' })],
    )
    await expect(
      resolveTrackerImportConflict(
        { organizationId: otherOrg.id, requesterId: otherUser.id },
        first.items[0].linkId!,
        { title: 'REMOTE' },
      ),
    ).rejects.toThrow('Import link not found')
  })

  it('reports an invalid item as failed while continuing the page', async () => {
    const result = await importTrackerItems(
      { organizationId: org.id, requesterId: user.id },
      [linearItem({ remoteEntityId: 'invalid-title', title: '   ' }), linearItem({ remoteEntityId: 'valid-after-failure' })],
    )
    expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, failed: 1 })
    expect(result.items.map(item => item.outcome)).toEqual(['failed', 'created'])
  })
})
