// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query, getClient } from '@/lib/db/pool';
import { beginAgentRun, finishAgentRun, withAgentMutation } from './runs';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg, hasDb, type TestOrg, type TestUser, type TestRequest } from '@/test/db-helpers';

describe.skipIf(!hasDb())('agent run authorization and atomic writes', () => {
  let org: TestOrg;
  let owner: TestUser;
  let outsider: TestUser;
  let reviewer: TestUser;
  let request: TestRequest;
  beforeAll(async () => {
    org = await createTestOrg('agent-runs');
    owner = await createTestUser(org);
    outsider = await createTestUser(org);
    reviewer = await createTestUser(org, 'REVIEWER');
    request = await createTestRequest(org, owner);
  });
  beforeEach(async () => {
    await query('DELETE FROM agent_runs WHERE request_id = $1', [request.id]);
    await query("UPDATE feature_requests SET status = 'DRAFT', summary = NULL, intake_complete = false WHERE id = $1", [request.id]);
  });
  afterAll(async () => { await cleanupTestOrg(org, [owner.id, outsider.id, reviewer.id]); });
  const scope = () => ({ requestId: request.id, orgId: org.id, userId: owner.id, agent: 'intake' as const });

  it('denies another stakeholder while permitting the requester or reviewer', async () => {
    await expect(beginAgentRun({ ...scope(), userId: outsider.id })).rejects.toMatchObject({ status: 403 });
    const run = await beginAgentRun({ ...scope(), userId: reviewer.id });
    expect(run.id).toBeTruthy();
  });

  it('admits only one concurrent run for a request', async () => {
    const results = await Promise.allSettled([beginAgentRun(scope()), beginAgentRun(scope())]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await query("SELECT id FROM agent_runs WHERE request_id = $1 AND status = 'RUNNING'", [request.id]);
    expect(rows.rows).toHaveLength(1);
  });

  it('prevents replay on completed requests', async () => {
    await query("UPDATE feature_requests SET status = 'COMPLETED' WHERE id = $1", [request.id]);
    await expect(beginAgentRun(scope())).rejects.toMatchObject({ status: 409 });
  });

  it('checks state again at mutation time rather than trusting the run start', async () => {
    const run = await beginAgentRun(scope());
    await query("UPDATE feature_requests SET status = 'COMPLETED' WHERE id = $1", [request.id]);
    await expect(withAgentMutation({ ...scope(), runId: run.id }, async () => {
      await query("UPDATE feature_requests SET summary = 'bad' WHERE id = $1", [request.id]);
    })).rejects.toMatchObject({ status: 409 });
    expect((await query('SELECT summary FROM feature_requests WHERE id = $1', [request.id])).rows[0].summary).toBeNull();
  });

  it('rolls back all writes if a tool fails halfway through', async () => {
    const run = await beginAgentRun(scope());
    await expect(withAgentMutation({ ...scope(), runId: run.id }, async () => {
      await query("UPDATE feature_requests SET summary = 'partial' WHERE id = $1", [request.id]);
      throw new Error('second write failed');
    })).rejects.toThrow('second write failed');
    expect((await query('SELECT summary FROM feature_requests WHERE id = $1', [request.id])).rows[0].summary).toBeNull();
  });

  it('allows a fresh run after failure but never a stale run token', async () => {
    const first = await beginAgentRun(scope());
    await finishAgentRun(first.id, 'FAILED');
    const second = await beginAgentRun(scope());
    await expect(withAgentMutation({ ...scope(), runId: first.id }, async () => true)).rejects.toMatchObject({ status: 409 });
    expect(await withAgentMutation({ ...scope(), runId: second.id }, async () => true)).toBe(true);
  });

  it('rejects a lease that expires while waiting for the request lock', async () => {
    const run = await beginAgentRun(scope());
    const blocker = await getClient();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM feature_requests WHERE id = $1 FOR UPDATE', [request.id]);
      await query("UPDATE agent_runs SET expires_at = clock_timestamp() + interval '200 milliseconds' WHERE id = $1", [run.id]);
      const pending = withAgentMutation({ ...scope(), runId: run.id }, async () => 'should not execute');
      const outcome = pending.then(value => ({ value }), error => ({ error }));
      await blocker.query('SELECT pg_sleep(0.4)');
      await blocker.query('COMMIT');
      expect(await outcome).toMatchObject({ error: { status: 409 } });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
  });
});
