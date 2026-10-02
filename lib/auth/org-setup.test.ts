// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { cleanupTestOrg, createTestOrg, hasDb, type TestOrg } from '@/test/db-helpers';
import { resolveSessionIdentity } from './org-setup';

describe.skipIf(!hasDb())('resolveSessionIdentity for allowlisted domains', () => {
  let org: TestOrg;
  const userIds: string[] = [];

  beforeAll(async () => { org = await createTestOrg('allowlist-join'); });
  afterEach(() => { delete process.env.ALLOWED_EMAIL_DOMAINS; });
  afterAll(async () => { await cleanupTestOrg(org, userIds); });

  it('should join the mapped workspace as STAKEHOLDER instead of creating an ADMIN workspace', async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = `allowlisted.example=${org.slug}`;
    const email = `colleague-${org.slug}@allowlisted.example`;
    const user = await query<{ id: string }>(`INSERT INTO users (email, name) VALUES ($1, 'Colleague') RETURNING id`, [email]);
    userIds.push(user.rows[0].id);

    const identity = await resolveSessionIdentity(user.rows[0].id, email);

    expect(identity).toEqual({ kind: 'member', orgId: org.id, role: 'STAKEHOLDER' });
    const memberships = await query(`SELECT organization_id FROM organization_users WHERE user_id = $1`, [user.rows[0].id]);
    expect(memberships.rows).toEqual([{ organization_id: org.id }]);
  });
});
