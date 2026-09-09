// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { getOrganizationById } from '@/lib/db/queries/organizations';
import { renameOrganization } from './organization-actions';

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'ADMIN' }));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe.skipIf(!hasDb())('organization administration', () => {
  let org: TestOrg, foreign: TestOrg, user: TestUser;
  beforeAll(async () => {
    org = await createTestOrg('admin-settings'); foreign = await createTestOrg('foreign-settings');
    user = await createTestUser(org, 'ADMIN');
  });
  beforeEach(async () => {
    Object.assign(actor, { id: user.id, orgId: org.id, role: 'ADMIN' });
    await query("UPDATE organization_users SET role = 'ADMIN' WHERE user_id = $1", [user.id]);
  });
  afterAll(async () => { await cleanupTestOrg(foreign); await cleanupTestOrg(org, [user.id]); });
  it('persists a trimmed name while retaining settings and slug, and records the change', async () => {
    await query('UPDATE organizations SET settings = $1 WHERE id = $2', [{ custom: { keep: true } }, org.id]);
    expect(await renameOrganization('  Product Team  ')).toMatchObject({ success: true, name: 'Product Team' });
    expect(await getOrganizationById(org.id)).toMatchObject({ name: 'Product Team', slug: org.slug, settings: { custom: { keep: true } } });
    const log = await query("SELECT * FROM activity_log WHERE organization_id = $1 AND action = 'ORGANIZATION_UPDATED'", [org.id]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({ user_id: user.id, entity_id: org.id, metadata: { name: 'Product Team' } });
  });
  it.each(['STAKEHOLDER', 'REVIEWER'])('rejects a %s', async role => {
    actor.role = role;
    expect(await renameOrganization('No')).toMatchObject({ success: false });
  });
  it('rejects stale admin membership and forged foreign session organization', async () => {
    await query("UPDATE organization_users SET role = 'REVIEWER' WHERE user_id = $1", [user.id]);
    expect(await renameOrganization('No')).toMatchObject({ success: false });
    actor.orgId = foreign.id;
    expect(await renameOrganization('No')).toMatchObject({ success: false });
    expect(await getOrganizationById(foreign.id)).toMatchObject({ name: 'foreign-settings' });
  });
  it.each(['', '   ', 'x'.repeat(121)])('rejects invalid name length', async name => {
    expect(await renameOrganization(name)).toMatchObject({ success: false });
  });
});
