import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { recordAgentUsage, getAgentUsageSummary } from './agent-usage'
import { query } from '@/lib/db/pool'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
  type TestRequest,
} from '@/test/db-helpers'

const MODEL = 'claude-sonnet-4-5-20250929'

describe.skipIf(!hasDb())('agent usage queries', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let user: TestUser
  let otherUser: TestUser
  let request: TestRequest

  beforeAll(async () => {
    org = await createTestOrg('agent-usage-test')
    otherOrg = await createTestOrg('agent-usage-other')
    user = await createTestUser(org)
    otherUser = await createTestUser(otherOrg)
    request = await createTestRequest(org, user, 'Agent usage test request')
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id])
    await cleanupTestOrg(otherOrg, [otherUser.id])
  })

  beforeEach(async () => {
    await query(`DELETE FROM agent_usage WHERE organization_id = ANY($1)`, [
      [org.id, otherOrg.id],
    ])
  })

  function usageRow(overrides: Partial<Parameters<typeof recordAgentUsage>[0]> = {}) {
    return {
      organizationId: org.id,
      requestId: request.id,
      userId: user.id,
      agent: 'intake' as const,
      model: MODEL,
      inputTokens: 1000,
      outputTokens: 100,
      durationMs: 2000,
      steps: 2,
      finishReason: 'stop',
      ...overrides,
    }
  }

  it('should return an empty summary when no usage is recorded', async () => {
    const summary = await getAgentUsageSummary(org.id)
    expect(summary.rows).toEqual([])
    expect(summary.total.calls).toBe(0)
    expect(summary.total.avgDurationMs).toBe(0)
  })

  it('should aggregate two rows for the same agent', async () => {
    await recordAgentUsage(usageRow())
    await recordAgentUsage(
      usageRow({ inputTokens: 3000, outputTokens: 500, durationMs: 4000, steps: 1 })
    )

    const summary = await getAgentUsageSummary(org.id)
    expect(summary.rows).toHaveLength(1)

    const [intake] = summary.rows
    expect(intake.agent).toBe('intake')
    expect(intake.calls).toBe(2)
    expect(intake.inputTokens).toBe(4000)
    expect(intake.outputTokens).toBe(600)
    expect(intake.avgDurationMs).toBe(3000)
    // 4000 input @ $3/MTok + 600 output @ $15/MTok
    expect(intake.estimatedCostUsd).toBeCloseTo(0.012 + 0.009, 10)
  })

  it('should produce one row per agent plus a total', async () => {
    await recordAgentUsage(usageRow({ agent: 'intake' }))
    await recordAgentUsage(
      usageRow({ agent: 'security', inputTokens: 500, outputTokens: 50, durationMs: 1000 })
    )

    const summary = await getAgentUsageSummary(org.id)
    expect(summary.rows.map((r) => r.agent).sort()).toEqual(['intake', 'security'])
    expect(summary.total.calls).toBe(2)
    expect(summary.total.inputTokens).toBe(1500)
    expect(summary.total.outputTokens).toBe(150)
    expect(summary.total.avgDurationMs).toBe(1500)
  })

  it('should not include usage from another organization', async () => {
    await recordAgentUsage(usageRow())
    await recordAgentUsage(
      usageRow({ organizationId: otherOrg.id, requestId: null, userId: otherUser.id })
    )

    const summary = await getAgentUsageSummary(org.id)
    expect(summary.total.calls).toBe(1)
  })

  it('should filter by date range', async () => {
    await recordAgentUsage(usageRow())

    const future = await getAgentUsageSummary(org.id, {
      from: '2999-01-01',
      to: '2999-12-31',
    })
    expect(future.rows).toEqual([])

    const wide = await getAgentUsageSummary(org.id, {
      from: '2000-01-01',
      to: '2999-12-31',
    })
    expect(wide.total.calls).toBe(1)
  })

  it('should accept null request and user ids', async () => {
    await recordAgentUsage(usageRow({ requestId: null, userId: null, finishReason: null }))
    const summary = await getAgentUsageSummary(org.id)
    expect(summary.total.calls).toBe(1)
  })
})
