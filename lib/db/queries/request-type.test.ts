// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { findSimilarRequests, getFeatureRequestById, listFeatureRequests, searchFeatureRequests } from './feature-requests'
import { listRequestQueue } from './request-queue'
import { getPlanningBoard } from './planning'
import { getDashboardSummary, getStatusDistribution } from './analytics'
import { countRequestsUnderReview } from './review-cycles'
import { upsertVote } from './votes'
import { lockAuthorizedRequest } from '@/lib/agents/runs'

describe.skipIf(!hasDb())('request types keep change requests off product surfaces', () => {
  let org: TestOrg
  let admin: TestUser
  let product: string
  let change: string
  const title = `Export invoices to the ledger ${crypto.randomUUID().slice(0, 8)}`

  const setStatus = (status: string) => query('UPDATE feature_requests SET status = $2 WHERE id = ANY($1)', [[product, change], status])
  const ids = (rows: { id: string }[]) => rows.map(row => row.id)

  beforeAll(async () => {
    org = await createTestOrg('request-type')
    admin = await createTestUser(org, 'ADMIN')
    product = (await createTestRequest(org, admin, title)).id
    change = (await createTestRequest(org, admin, title)).id
    await query(`UPDATE feature_requests SET request_type = 'CHANGE' WHERE id = $1`, [change])
  })
  afterAll(async () => { await cleanupTestOrg(org, [admin.id]) })

  it('defaults new requests to PRODUCT and maps the type', async () => {
    expect((await getFeatureRequestById(product))?.requestType).toBe('PRODUCT')
    expect((await getFeatureRequestById(change))?.requestType).toBe('CHANGE')
    await expect(query(`UPDATE feature_requests SET request_type = 'OTHER' WHERE id = $1`, [product])).rejects.toThrow()
  })

  it('keeps product_requests in step with every feature_requests column', async () => {
    const columns = async (table: string) => (await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table])).rows.map(r => r.column_name)
    expect(await columns('product_requests')).toEqual(await columns('feature_requests'))
  })

  it('leaves change requests out of the review and backlog queues, the request list and the API list', async () => {
    await setStatus('UNDER_REVIEW')
    expect(ids((await listRequestQueue(org.id, 'review', {})).requests)).toEqual([product])
    expect(ids((await searchFeatureRequests(org.id, {})).requests)).toEqual([product])
    expect(ids((await listFeatureRequests(org.id)).requests)).toEqual([product])
    expect(await countRequestsUnderReview([product, change])).toBe(1)
    await setStatus('APPROVED')
    expect(ids((await listRequestQueue(org.id, 'backlog', {})).requests)).toEqual([product])
  })

  it('leaves change requests out of similar-request search, planning and analytics', async () => {
    expect((await findSimilarRequests(org.id, title)).map(r => r.id)).toEqual([product])
    expect(ids(await getPlanningBoard(org.id))).toEqual([product])
    expect((await getDashboardSummary(org.id)).totalRequests).toBe(1)
    expect((await getStatusDistribution(org.id)).reduce((sum, row) => sum + row.count, 0)).toBe(1)
  })

  it('refuses votes and AI agents on change requests', async () => {
    await expect(upsertVote(product, admin.id, 4, null)).resolves.toMatchObject({ voteValue: 4 })
    await expect(upsertVote(change, admin.id, 4, null)).rejects.toThrow(/product requests/)
    await expect(lockAuthorizedRequest({ requestId: change, orgId: org.id, userId: admin.id, agent: 'intake' })).rejects.toThrow(/product requests/)
    await expect(lockAuthorizedRequest({ requestId: product, orgId: org.id, userId: admin.id, agent: 'intake' })).resolves.toMatchObject({ id: product })
  })
})
