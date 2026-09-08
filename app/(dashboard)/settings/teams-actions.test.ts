// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestOrg, createTestUser, cleanupTestOrg, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { upsertTeamsNotification, getTeamsNotifications } from '@/lib/db/queries/teams';
import { removeTeamsNotificationConfig } from './teams-actions';
const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'REVIEWER' }));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
describe.skipIf(!hasDb())('Teams preference tenant boundary', () => {
  let org: TestOrg, foreign: TestOrg, user: TestUser;
  beforeAll(async () => { org = await createTestOrg('teams-owner'); foreign = await createTestOrg('teams-foreign'); user = await createTestUser(org, 'REVIEWER'); Object.assign(actor, { id: user.id, orgId: org.id }); });
  afterAll(async () => { await cleanupTestOrg(foreign); await cleanupTestOrg(org, [user.id]); });
  it('does not remove another organization’s notification preference', async () => {
    const notification = await upsertTeamsNotification(foreign.id, 'Foreign', 'https://example.com/test', 'REQUEST_CREATED');
    expect(await removeTeamsNotificationConfig(notification.id)).toMatchObject({ success: false });
    expect(await getTeamsNotifications(foreign.id)).toHaveLength(1);
  });
  it('lets a reviewer remove their own organization’s preference', async () => {
    const notification = await upsertTeamsNotification(org.id, 'Owned', 'https://example.com/test', 'REQUEST_CREATED');
    expect(await removeTeamsNotificationConfig(notification.id)).toMatchObject({ success: true });
    expect(await getTeamsNotifications(org.id)).toHaveLength(0);
  });
});
