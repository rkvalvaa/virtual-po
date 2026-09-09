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

  it('switches only to a workspace with a current membership and derives its role from the database', async () => {
    const target = await createTestOrg('session-destination');
    try {
      const callback = capture.config!.callbacks!.jwt!;
      const token: JWT = { id: user.id, orgId: org.id, role: 'ADMIN' };
      const update = { token, account: null, trigger: 'update', session: { user: { orgId: target.id, role: 'ADMIN' } } };
      expect(await callback(update as Parameters<typeof callback>[0])).toMatchObject({ orgId: org.id });
      await query("INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'STAKEHOLDER')", [target.id, user.id]);
      expect(await callback(update as Parameters<typeof callback>[0])).toMatchObject({ orgId: target.id, role: 'STAKEHOLDER' });
      const preference = await query<{ preferred_organization_id: string | null }>(
        'SELECT preferred_organization_id FROM users WHERE id = $1',
        [user.id],
      );
      expect(preference.rows[0].preferred_organization_id).toBe(target.id);
    } finally { await cleanupTestOrg(target); }
  });

  it('restores a preferred workspace on sign-in and falls back after that membership is revoked', async () => {
    const preferred = await createTestOrg('session-preferred');
    try {
      await query(
        "INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'REVIEWER')",
        [preferred.id, user.id],
      );
      await query('UPDATE users SET preferred_organization_id = $2 WHERE id = $1', [user.id, preferred.id]);
      const callback = capture.config!.callbacks!.jwt!;
      const signIn = {
        token: {} as JWT,
        user: { id: user.id, email: user.email, name: 'Workspace user' },
        account: null,
      };
      await expect(callback(signIn as Parameters<typeof callback>[0])).resolves.toMatchObject({
        orgId: preferred.id,
        role: 'REVIEWER',
      });

      await query(
        'DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2',
        [preferred.id, user.id],
      );
      await expect(callback({ ...signIn, token: {} } as Parameters<typeof callback>[0])).resolves.toMatchObject({
        orgId: org.id,
        role: 'STAKEHOLDER',
      });
      const memberships = await query(
        'SELECT organization_id FROM organization_users WHERE user_id = $1',
        [user.id],
      );
      expect(memberships.rows).toEqual([{ organization_id: org.id }]);
    } finally { await cleanupTestOrg(preferred); }
  });

  it('does not switch or remember an update target revoked before validation', async () => {
    const revoked = await createTestOrg('session-revoked-target');
    try {
      await query(
        "INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'ADMIN')",
        [revoked.id, user.id],
      );
      await query('UPDATE users SET preferred_organization_id = $2 WHERE id = $1', [user.id, org.id]);
      await query(
        'DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2',
        [revoked.id, user.id],
      );
      const callback = capture.config!.callbacks!.jwt!;
      const update = {
        token: { id: user.id, orgId: org.id, role: 'STAKEHOLDER' } as JWT,
        account: null,
        trigger: 'update',
        session: { user: { orgId: revoked.id, role: 'ADMIN' } },
      };
      await expect(callback(update as Parameters<typeof callback>[0])).resolves.toMatchObject({
        orgId: org.id,
        role: 'STAKEHOLDER',
      });
      const preference = await query<{ preferred_organization_id: string | null }>(
        'SELECT preferred_organization_id FROM users WHERE id = $1',
        [user.id],
      );
      expect(preference.rows[0].preferred_organization_id).toBe(org.id);
    } finally { await cleanupTestOrg(revoked); }
  });

  it('invalidates a token for a removed member without provisioning new access', async () => {
    await query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [org.id, user.id]);
    expect(await refresh()).toBeNull();
    const result = await query('SELECT * FROM organization_users WHERE user_id = $1', [user.id]);
    expect(result.rows).toHaveLength(0);
  });
});
