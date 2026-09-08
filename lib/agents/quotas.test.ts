// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { beginAgentRun, finishAgentRun } from './runs';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg, hasDb, type TestOrg, type TestUser, type TestRequest } from '@/test/db-helpers';

describe.skipIf(!hasDb())('shared AI admission quotas', () => {
  let org: TestOrg, user: TestUser, other: TestUser, requests: TestRequest[];
  let reviewers: TestUser[];
  beforeAll(async () => {
    org = await createTestOrg('quotas'); user = await createTestUser(org); other = await createTestUser(org, 'REVIEWER');
    reviewers = await Promise.all([createTestUser(org, 'REVIEWER'), createTestUser(org, 'REVIEWER')]);
    requests = await Promise.all(Array.from({ length: 4 }, () => createTestRequest(org, user)));
  });
  beforeEach(async () => { await query('DELETE FROM agent_runs WHERE organization_id = $1', [org.id]); });
  afterAll(async () => { await cleanupTestOrg(org, [user.id, other.id, ...reviewers.map(reviewer => reviewer.id)]); });
  const scope = (index = 0) => ({ orgId: org.id, userId: user.id, requestId: requests[index].id, agent: 'intake' as const });
  async function seedRuns(userId: string, count: number) {
    await query(`INSERT INTO agent_runs(request_id, organization_id, user_id, agent, status)
      SELECT $1, $2, $3, 'intake', 'SUCCEEDED' FROM generate_series(1, $4::int)`, [requests[0].id, org.id, userId, count]);
  }
  it('denies a user at their hourly quota and admits them after the window', async () => {
    await seedRuns(user.id, 60);
    await expect(beginAgentRun(scope())).rejects.toMatchObject({ status: 429, retryAfter: 3600 });
    await query("UPDATE agent_runs SET created_at = NOW() - interval '61 minutes' WHERE organization_id = $1", [org.id]);
    expect((await beginAgentRun(scope())).id).toBeTruthy();
  });
  it('enforces the organization quota across different users', async () => {
    await seedRuns(other.id, 300);
    await expect(beginAgentRun(scope())).rejects.toMatchObject({ status: 429 });
  });
  it('keeps a user quota shared when that user switches organizations', async () => {
    await seedRuns(user.id, 60);
    const secondOrg = await createTestOrg('quota-second-org');
    try {
      await query("INSERT INTO organization_users(organization_id, user_id, role) VALUES ($1, $2, 'ADMIN')", [secondOrg.id, user.id]);
      const secondRequest = await createTestRequest(secondOrg, user);
      await expect(beginAgentRun({ ...scope(), orgId: secondOrg.id, requestId: secondRequest.id })).rejects.toMatchObject({ status: 429 });
    } finally { await cleanupTestOrg(secondOrg, []); }
  });
  it('admits only three simultaneous runs and releases a failed slot', async () => {
    const outcomes = await Promise.allSettled(requests.map((_, index) => beginAgentRun(scope(index))));
    const admitted = outcomes.filter(result => result.status === 'fulfilled');
    expect(admitted).toHaveLength(3);
    const rejected = outcomes.findIndex(result => result.status === 'rejected');
    expect(outcomes[rejected]).toMatchObject({ reason: { status: 429, retryAfter: 30 } });
    await finishAgentRun(admitted[0].value.id, 'FAILED');
    expect((await beginAgentRun(scope(rejected))).id).toBeTruthy();
  });
  it('coordinates simultaneous organization admissions by different users', async () => {
    const actors = [user, other, ...reviewers];
    const outcomes = await Promise.allSettled(actors.map((actor, index) => beginAgentRun({ ...scope(index), userId: actor.id })));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(3);
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 429 } });
  });
});
