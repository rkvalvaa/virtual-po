// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestChangeRequest, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { ExportRateLimited, ExportRejected } from './errors'
import { enqueueServiceTicket, getDelivery, listLinearDestinations, processDeliveries, replayDelivery, verifyLinearDestination, type LinearDeliveryClient } from './delivery'

const created = new Map<string, { id: string; url: string }>()
const client = {
  createIssue: vi.fn(), getIssue: vi.fn(), getTeams: vi.fn(), getProjects: vi.fn(),
} satisfies Record<keyof LinearDeliveryClient, unknown>
const clientFor = () => client as unknown as LinearDeliveryClient

describe.skipIf(!hasDb())('change-request delivery to Linear', () => {
  let org: TestOrg
  let reviewer: TestUser
  let stakeholder: TestUser

  beforeAll(async () => {
    vi.stubEnv('APP_URL', 'https://vpo.example')
    org = await createTestOrg('delivery')
    reviewer = await createTestUser(org, 'REVIEWER')
    stakeholder = await createTestUser(org, 'STAKEHOLDER')
    await query(`INSERT INTO integrations (organization_id, type, name, config, is_active) VALUES ($1, 'LINEAR', 'Linear', $2, true)`, [org.id, { apiKey: 'lin_test' }])
  })
  afterAll(async () => { vi.unstubAllEnvs(); await cleanupTestOrg(org, [reviewer.id, stakeholder.id]) })
  beforeEach(() => {
    created.clear()
    client.createIssue.mockReset().mockImplementation(async (_team: string, title: string, _body: string, _priority: unknown, id: string) => {
      const issue = { id, url: `https://linear.app/acme/issue/${id}`, title }
      created.set(id, issue)
      return issue
    })
    client.getIssue.mockReset().mockImplementation(async (id: string) => {
      const issue = created.get(id)
      if (!issue) throw new Error('Entity not found: Issue')
      return issue
    })
  })

  async function queued(title = 'Rotate the VPN certificates') {
    const { id } = await createTestChangeRequest(org, stakeholder, title)
    await enqueueServiceTicket({ requestId: id, orgId: org.id, destination: { integration: 'LINEAR', teamId: 'team-1', projectId: 'project-1' },
      title, summary: 'Reason: They expire in March' })
    return id
  }
  const due = (id: string) => query(`UPDATE tracker_exports SET next_attempt_at = clock_timestamp() WHERE request_id = $1`, [id])
  const run = () => processDeliveries({ clientFor })

  it('delivers a queued change request once, with its summary and a link back to VPO', async () => {
    const id = await queued()
    await run()
    await run()
    expect(client.createIssue).toHaveBeenCalledTimes(1)
    const [team, title, body, , issueId, projectId] = client.createIssue.mock.calls[0]
    expect([team, title, projectId]).toEqual(['team-1', 'Rotate the VPN certificates', 'project-1'])
    expect(body).toContain('Reason: They expire in March')
    expect(body).toContain(`/requests/${id}`)
    expect(body).toContain(`vpo-export-${issueId}`)
    expect(await getDelivery(id, org.id)).toMatchObject({ status: 'DELIVERED', url: `https://linear.app/acme/issue/${issueId}` })
  })

  it('recovers an issue created before a timeout instead of creating a second one', async () => {
    const id = await queued()
    client.createIssue.mockImplementationOnce(async (_team: string, title: string, _body: string, _priority: unknown, issueId: string) => {
      created.set(issueId, { id: issueId, url: `https://linear.app/acme/issue/${issueId}` })
      throw new Error('The operation was aborted due to timeout')
    })
    await run()
    expect(await getDelivery(id, org.id)).toMatchObject({ status: 'QUEUED', attempts: 1 })
    await due(id)
    await run()
    expect(client.createIssue).toHaveBeenCalledTimes(1)
    expect(await getDelivery(id, org.id)).toMatchObject({ status: 'DELIVERED' })
  })

  it('backs off after a rate limit and delivers on the next attempt', async () => {
    const id = await queued()
    client.createIssue.mockRejectedValueOnce(new ExportRateLimited('Linear GraphQL errors: Rate limited'))
    await run()
    const waiting = await getDelivery(id, org.id)
    expect(waiting).toMatchObject({ status: 'QUEUED', attempts: 1 })
    expect(new Date(waiting!.nextAttemptAt!).getTime()).toBeGreaterThan(Date.now())
    await run()
    expect(client.createIssue).toHaveBeenCalledTimes(1)
    await due(id)
    await run()
    expect(await getDelivery(id, org.id)).toMatchObject({ status: 'DELIVERED' })
  })

  it('lets only one of two concurrent cron runs deliver', async () => {
    const id = await queued()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    client.createIssue.mockImplementationOnce(async (_team: string, _title: string, _body: string, _priority: unknown, issueId: string) => {
      await gate
      const issue = { id: issueId, url: `https://linear.app/acme/issue/${issueId}` }
      created.set(issueId, issue)
      return issue
    })
    const first = run()
    await vi.waitFor(() => expect(client.createIssue).toHaveBeenCalledTimes(1))
    await run()
    release()
    await first
    expect(client.createIssue).toHaveBeenCalledTimes(1)
    expect(await getDelivery(id, org.id)).toMatchObject({ status: 'DELIVERED' })
  })

  it('needs attention when the destination is refused, fails after bounded retries, and can be replayed by a reviewer', async () => {
    const refused = await queued('Refused')
    client.createIssue.mockRejectedValueOnce(new ExportRejected('Linear API error 403: forbidden'))
    await run()
    expect(await getDelivery(refused, org.id)).toMatchObject({ status: 'NEEDS_ATTENTION', error: expect.stringContaining('403') })

    const flaky = await queued('Flaky')
    client.createIssue.mockImplementation(async () => { throw new ExportRateLimited('Rate limited') })
    for (let attempt = 0; attempt < 5; attempt++) { await due(flaky); await run() }
    expect(await getDelivery(flaky, org.id)).toMatchObject({ status: 'FAILED', attempts: 5 })

    await expect(replayDelivery(flaky, org.id, stakeholder.id)).rejects.toThrow(/reviewer/i)
    client.createIssue.mockImplementation(async (_team: string, title: string, _body: string, _priority: unknown, issueId: string) =>
      ({ id: issueId, url: `https://linear.app/acme/issue/${issueId}`, title }))
    await replayDelivery(flaky, org.id, reviewer.id)
    await replayDelivery(refused, org.id, reviewer.id)
    await run()
    expect(await getDelivery(flaky, org.id)).toMatchObject({ status: 'DELIVERED', attempts: 1 })
    expect(await getDelivery(refused, org.id)).toMatchObject({ status: 'DELIVERED' })
  })

  it('needs attention when an unknown outcome cannot be found, and a replay re-creates with the same issue id', async () => {
    const id = await queued('Lost')
    client.createIssue.mockRejectedValueOnce(new Error('socket hang up'))
    await run()
    await due(id)
    await run()
    expect(await getDelivery(id, org.id)).toMatchObject({ status: 'NEEDS_ATTENTION', error: expect.stringMatching(/unknown/i) })
    const firstId = client.createIssue.mock.calls[0][4]
    await replayDelivery(id, org.id, reviewer.id)
    await run()
    expect(client.createIssue).toHaveBeenCalledTimes(2)
    expect(client.createIssue.mock.calls[1][4]).toBe(firstId)
    expect(await getDelivery(id, org.id)).toMatchObject({ status: 'DELIVERED' })
  })

  it('needs attention when the workspace has no Linear connection', async () => {
    const other = await createTestOrg('delivery-unconnected')
    const user = await createTestUser(other, 'STAKEHOLDER')
    try {
      const { id } = await createTestChangeRequest(other, user)
      await enqueueServiceTicket({ requestId: id, orgId: other.id, destination: { integration: 'LINEAR', teamId: 'team-1', projectId: null }, title: 'x', summary: '' })
      await run()
      expect(await getDelivery(id, other.id)).toMatchObject({ status: 'NEEDS_ATTENTION', error: expect.stringMatching(/Linear/) })
    } finally { await cleanupTestOrg(other, [user.id]) }
  })

  it('accepts only a destination the connected Linear account can reach', async () => {
    client.getTeams.mockResolvedValue([{ id: 'team-1', name: 'Ops', key: 'OPS' }])
    client.getProjects.mockResolvedValue([{ id: 'project-1', name: 'Infra', url: '', state: 'started' }])
    await expect(verifyLinearDestination(org.id, { integration: 'LINEAR', teamId: 'team-1', projectId: 'project-1' }, clientFor)).resolves.toBeUndefined()
    await expect(verifyLinearDestination(org.id, { integration: 'LINEAR', teamId: 'team-9', projectId: null }, clientFor)).rejects.toThrow(/team/i)
    await expect(verifyLinearDestination(org.id, { integration: 'LINEAR', teamId: 'team-1', projectId: 'project-9' }, clientFor)).rejects.toThrow(/project/i)
    await expect(verifyLinearDestination(crypto.randomUUID(), { integration: 'LINEAR', teamId: 'team-1', projectId: null }, clientFor)).rejects.toThrow(/Connect Linear/)
    expect(await listLinearDestinations({ config: {} }, clientFor)).toEqual([{ id: 'team-1', name: 'Ops', projects: [{ id: 'project-1', name: 'Infra' }] }])
    client.getTeams.mockRejectedValueOnce(new Error('Linear API error 401'))
    expect(await listLinearDestinations({ config: {} }, clientFor)).toBeNull()
  })
})
