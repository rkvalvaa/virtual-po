// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { beginAgentRun, finishAgentRun } from '@/lib/agents/runs';
import { maxAgentReservationMicrousd } from '@/lib/agents/budget';
import { recordAgentUsage } from './agent-usage';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestRequest, type TestUser } from '@/test/db-helpers';
import {
  getAgentBudgetStatus,
  markAgentBudgetUnknown,
  settleMeasuredAgentBudget,
  updateOrganizationAgentBudget,
} from './agent-budget';

describe.skipIf(!hasDb())('organization AI budgets', () => {
  let org: TestOrg;
  let otherOrg: TestOrg;
  let admin: TestUser;
  let secondUser: TestUser;
  let outsider: TestUser;
  let requests: TestRequest[];
  const ceiling = 100_000_000;
  const reservation = maxAgentReservationMicrousd('claude-opus-5')!;
  const previousCeiling = process.env.AI_BUDGET_MAX_MONTHLY_USD;

  beforeAll(async () => {
    process.env.AI_BUDGET_MAX_MONTHLY_USD = '100';
    org = await createTestOrg('agent-budget');
    otherOrg = await createTestOrg('agent-budget-foreign');
    admin = await createTestUser(org, 'ADMIN');
    secondUser = await createTestUser(org, 'REVIEWER');
    outsider = await createTestUser(otherOrg, 'ADMIN');
    requests = await Promise.all([
      createTestRequest(org, admin, 'Budget request one'),
      createTestRequest(org, secondUser, 'Budget request two'),
    ]);
  });

  beforeEach(async () => {
    await query('DELETE FROM agent_usage WHERE organization_id=$1', [org.id]);
    await query('DELETE FROM agent_runs WHERE organization_id=$1', [org.id]);
    await query('DELETE FROM organization_ai_budgets WHERE organization_id=$1', [org.id]);
  });

  afterAll(async () => {
    if (previousCeiling === undefined) delete process.env.AI_BUDGET_MAX_MONTHLY_USD;
    else process.env.AI_BUDGET_MAX_MONTHLY_USD = previousCeiling;
    await cleanupTestOrg(otherOrg, [outsider.id]);
    await cleanupTestOrg(org, [admin.id, secondUser.id]);
  });

  async function configure(limitMicrousd: number, expectedVersion = 0, warningPercent = 80) {
    return updateOrganizationAgentBudget({
      orgId: org.id,
      adminUserId: admin.id,
      monthlyLimitMicrousd: limitMicrousd,
      warningPercent,
      expectedVersion,
      deploymentCeilingMicrousd: ceiling,
    });
  }

  it('prevents configuration above the deployment ceiling and stale version writes', async () => {
    await expect(configure(ceiling + 1)).rejects.toThrow(/deployment ceiling/i);
    const first = await configure(50_000_000);
    expect(first.version).toBe(1);
    await expect(configure(40_000_000, 0)).rejects.toThrow(/changed/i);
    await expect(updateOrganizationAgentBudget({
      orgId: org.id,
      adminUserId: outsider.id,
      monthlyLimitMicrousd: 10_000_000,
      warningPercent: 80,
      expectedVersion: first.version,
      deploymentCeilingMicrousd: ceiling,
    })).rejects.toThrow(/administrator/i);
  });

  it('serializes the first versioned configuration write', async () => {
    const writes = await Promise.allSettled([configure(50_000_000), configure(40_000_000)]);
    expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await query('SELECT version FROM organization_ai_budgets WHERE organization_id=$1', [org.id])).rows[0].version).toBe(1);
  });

  it('serializes concurrent admissions against reserved spend', async () => {
    await configure(Math.floor(reservation * 1.5));
    const outcomes = await Promise.allSettled([
      beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5'),
      beginAgentRun({ requestId: requests[1].id, orgId: org.id, userId: secondUser.id, agent: 'intake' }, 'claude-opus-5'),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 429 } });
    expect((await query('SELECT * FROM agent_budget_ledger WHERE organization_id=$1', [org.id])).rowCount).toBe(1);
  });

  it('keeps unknown usage reserved and reports the current UTC reset', async () => {
    await configure(20_000_000);
    const run = await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5');
    await markAgentBudgetUnknown(run.id, 'USAGE_MISSING');
    await finishAgentRun(run.id, 'SUCCEEDED');
    const status = await getAgentBudgetStatus(org.id, admin.id, ceiling);
    expect(status).toMatchObject({
      enabled: true,
      effectiveLimitMicrousd: 20_000_000,
      unknownReservedMicrousd: reservation,
      measuredMicrousd: 0,
      remainingMicrousd: 20_000_000 - reservation,
      unknownSettlements: 1,
      userRunsRemaining: 59,
      orgRunsRemaining: 299,
      concurrentRunsRemaining: 3,
    });
    expect(new Date(status!.resetAt).getUTCDate()).toBe(1);
    expect(new Date(status!.userRunResetAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('settles measured usage atomically and distinguishes measured zero', async () => {
    await configure(20_000_000);
    const run = await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5');
    await settleMeasuredAgentBudget({ runId: run.id, model: 'claude-opus-5', inputTokens: 0, outputTokens: 0 });
    const ledger = await query('SELECT state,settled_microusd,input_tokens,output_tokens FROM agent_budget_ledger WHERE run_id=$1', [run.id]);
    expect(ledger.rows[0]).toMatchObject({ state: 'MEASURED', settled_microusd: '0', input_tokens: '0', output_tokens: '0' });
    const status = await getAgentBudgetStatus(org.id, admin.id, ceiling);
    expect(status).toMatchObject({ measuredMicrousd: 0, reservedMicrousd: 0, unknownSettlements: 0 });
  });

  it('cannot settle against a cheaper model than the one reserved for the run', async () => {
    await configure(20_000_000);
    const run = await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5');
    await expect(settleMeasuredAgentBudget({ runId: run.id, model: 'claude-sonnet-4-5-20250929', inputTokens: 100, outputTokens: 20 }))
      .rejects.toThrow(/model/i);
    expect((await query('SELECT state FROM agent_budget_ledger WHERE run_id=$1', [run.id])).rows[0].state).toBe('RESERVED');
  });

  it('records telemetry and measured settlement against the same run exactly once', async () => {
    await configure(20_000_000);
    const run = await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5');
    const usage = {
      agentRunId: run.id,
      organizationId: org.id,
      requestId: requests[0].id,
      userId: admin.id,
      agent: 'intake' as const,
      model: 'claude-opus-5',
      inputTokens: 25,
      outputTokens: 10,
      durationMs: 5,
      steps: 1,
      finishReason: 'stop',
    };
    await recordAgentUsage(usage);
    await expect(recordAgentUsage(usage)).rejects.toThrow();
    const result = await query(`SELECT usage.input_tokens,ledger.state,ledger.input_tokens,ledger.output_tokens
      FROM agent_usage usage JOIN agent_budget_ledger ledger ON ledger.run_id=usage.agent_run_id
      WHERE usage.agent_run_id=$1`, [run.id]);
    expect(result.rows[0]).toMatchObject({ input_tokens: '25', state: 'MEASURED', output_tokens: '10' });
  });

  it('does not count a prior UTC month against the new window and isolates tenant reads', async () => {
    await configure(20_000_000);
    const run = await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5');
    await query("UPDATE agent_budget_ledger SET window_start=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 month' WHERE run_id=$1", [run.id]);
    const status = await getAgentBudgetStatus(org.id, admin.id, ceiling);
    expect(status?.remainingMicrousd).toBe(20_000_000);
    await expect(getAgentBudgetStatus(org.id, outsider.id, ceiling)).resolves.toBeNull();
  });

  it('rejects an unpriced model whenever a hard ceiling is active', async () => {
    await configure(20_000_000);
    await expect(beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'unknown-model'))
      .rejects.toMatchObject({ status: 503 });
  });

  it('keeps a ledger while enforcement is unavailable so later activation includes in-flight work', async () => {
    delete process.env.AI_BUDGET_MAX_MONTHLY_USD;
    try {
      const run = await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5');
      expect((await query('SELECT state FROM agent_budget_ledger WHERE run_id=$1', [run.id])).rows[0]).toEqual({ state: 'RESERVED' });
      await configure(50_000_000);
      const status = await getAgentBudgetStatus(org.id, admin.id, ceiling);
      expect(status?.reservedMicrousd).toBe(reservation);
    } finally {
      process.env.AI_BUDGET_MAX_MONTHLY_USD = '100';
    }
  });

  it('blocks later hard-budget admission after unpriced usage was allowed without enforcement', async () => {
    delete process.env.AI_BUDGET_MAX_MONTHLY_USD;
    try {
      await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'unpriced-model');
    } finally {
      process.env.AI_BUDGET_MAX_MONTHLY_USD = '100';
    }
    await configure(50_000_000);
    await expect(beginAgentRun({ requestId: requests[1].id, orgId: org.id, userId: secondUser.id, agent: 'intake' }, 'claude-opus-5'))
      .rejects.toMatchObject({ status: 503 });
    expect((await getAgentBudgetStatus(org.id, admin.id, ceiling))?.blockReason).toMatch(/without a server-approved price/i);
  });

  it('fails closed and rolls back admission for an invalid deployment ceiling', async () => {
    process.env.AI_BUDGET_MAX_MONTHLY_USD = 'invalid';
    try {
      await expect(beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5'))
        .rejects.toMatchObject({ status: 503 });
      expect((await query('SELECT * FROM agent_runs WHERE organization_id=$1', [org.id])).rowCount).toBe(0);
    } finally {
      process.env.AI_BUDGET_MAX_MONTHLY_USD = '100';
    }
  });

  it('includes current-window usage written before run-linked settlement', async () => {
    await query(`INSERT INTO agent_usage(organization_id,request_id,user_id,agent,model,input_tokens,output_tokens,duration_ms,steps,finish_reason)
      VALUES($1,$2,$3,'intake','claude-opus-5',100,20,1,1,'stop')`, [org.id, requests[0].id, admin.id]);
    await configure(20_000_000);
    const status = await getAgentBudgetStatus(org.id, admin.id, ceiling);
    expect(status?.measuredMicrousd).toBe(1_000);
  });

  it('records one administrator threshold notification per UTC budget window', async () => {
    await configure(50_000_000, 0, 1);
    const first = await beginAgentRun({ requestId: requests[0].id, orgId: org.id, userId: admin.id, agent: 'intake' }, 'claude-opus-5');
    await finishAgentRun(first.id, 'FAILED');
    const second = await beginAgentRun({ requestId: requests[1].id, orgId: org.id, userId: secondUser.id, agent: 'intake' }, 'claude-opus-5');
    await finishAgentRun(second.id, 'FAILED');
    const alerts = await query(`SELECT * FROM organization_ai_budget_alerts WHERE organization_id=$1`, [org.id]);
    const notifications = await query(`SELECT * FROM notifications WHERE organization_id=$1 AND user_id=$2 AND type='AI_BUDGET_WARNING'`, [org.id, admin.id]);
    expect(alerts.rowCount).toBe(1);
    expect(notifications.rowCount).toBe(1);
  });
});
