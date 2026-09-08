// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db/pool';
import { createTestOrg, createTestUser, cleanupTestOrg, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { createNewRequest } from './actions';

const identity = vi.hoisted(() => ({ userId: '', orgId: '' }));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: { id: identity.userId, orgId: identity.orgId } }) }));

describe.skipIf(!hasDb())('idempotent draft creation', () => {
  let org: TestOrg;
  let user: TestUser;
  beforeAll(async () => {
    org = await createTestOrg('draft-idempotency');
    user = await createTestUser(org);
    identity.userId = user.id;
    identity.orgId = org.id;
  });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });

  it('persists one request and one conversation for simultaneous retries', async () => {
    const params = { title: 'One draft', idempotencyKey: randomUUID() };
    const results = await Promise.all([createNewRequest(params), createNewRequest(params), createNewRequest(params)]);
    expect(new Set(results.map(r => r.requestId)).size).toBe(1);
    expect(new Set(results.map(r => r.conversationId)).size).toBe(1);
    const rows = await query(`SELECT COUNT(*)::int AS n FROM conversations c
      JOIN feature_requests r ON r.id = c.request_id WHERE r.organization_id = $1`, [org.id]);
    expect(rows.rows[0].n).toBe(1);
  });
});
