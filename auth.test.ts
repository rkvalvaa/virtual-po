// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { query } from '@/lib/db/pool';
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';

const capture = vi.hoisted(() => ({ config: undefined as NextAuthConfig | undefined }));
// Keep the production callbacks and membership queries real; only avoid the
// OAuth/HTTP framework so this test can hold the exact pre-revocation token.
vi.mock('next-auth', () => ({ default: (config: NextAuthConfig) => {
  capture.config = config;
  return {};
} }));
import './auth';

describe.skipIf(!hasDb())('existing JWT membership revalidation', () => {
  let org: TestOrg;
  let user: TestUser;
  beforeAll(async () => {
    org = await createTestOrg('session-refresh');
    user = await createTestUser(org, 'ADMIN');
  });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });

  async function refresh() {
    const token: JWT = { id: user.id, orgId: org.id, role: 'ADMIN' };
    const callback = capture.config!.callbacks!.jwt!;
    return callback({ token, account: null } as Parameters<typeof callback>[0]);
  }

  it('retains a valid current membership', async () => {
    expect(await refresh()).toMatchObject({ orgId: org.id, role: 'ADMIN' });
  });

  it('honors demotion on the next session access without signing in again', async () => {
    await query("UPDATE organization_users SET role = 'STAKEHOLDER' WHERE organization_id = $1 AND user_id = $2", [org.id, user.id]);
    expect(await refresh()).toMatchObject({ orgId: org.id, role: 'STAKEHOLDER' });
  });

  it('invalidates a token for a removed member without provisioning new access', async () => {
    await query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [org.id, user.id]);
    expect(await refresh()).toBeNull();
    const result = await query('SELECT * FROM organization_users WHERE user_id = $1', [user.id]);
    expect(result.rows).toHaveLength(0);
  });
});
