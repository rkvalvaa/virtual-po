// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import {
  cleanupTestOrg,
  createTestOrg,
  createTestUser,
  hasDb,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers';
import {
  getPreferredWorkspace,
  listUserWorkspaces,
  rememberWorkspace,
} from './workspaces';
import {
  createNotification,
  getNotificationsByUser,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from './notifications';

describe.skipIf(!hasDb())('workspace preferences', () => {
  let first: TestOrg;
  let second: TestOrg;
  let foreign: TestOrg;
  let user: TestUser;

  beforeAll(async () => {
    first = await createTestOrg('Alpha workspace');
    second = await createTestOrg('Beta workspace');
    foreign = await createTestOrg('Foreign workspace');
    user = await createTestUser(first, 'ADMIN');
    await query(
      `INSERT INTO organization_users (organization_id, user_id, role, created_at)
       VALUES ($1, $2, 'REVIEWER', '2025-01-01T00:00:00Z')`,
      [second.id, user.id],
    );
    await query(
      `UPDATE organization_users SET created_at = '2025-02-01T00:00:00Z'
       WHERE organization_id = $1 AND user_id = $2`,
      [first.id, user.id],
    );
  });

  beforeEach(async () => {
    await query('UPDATE users SET preferred_organization_id = NULL WHERE id = $1', [user.id]);
  });

  afterAll(async () => {
    await cleanupTestOrg(foreign);
    await cleanupTestOrg(second);
    await cleanupTestOrg(first, [user.id]);
  });

  it('lists only current memberships with their server-side roles', async () => {
    await expect(listUserWorkspaces(user.id)).resolves.toEqual([
      { id: first.id, name: 'Alpha workspace', role: 'ADMIN' },
      { id: second.id, name: 'Beta workspace', role: 'REVIEWER' },
    ]);
  });

  it('persists a preference only when the user currently belongs to the workspace', async () => {
    await expect(rememberWorkspace(user.id, second.id)).resolves.toBe(true);
    await expect(getPreferredWorkspace(user.id)).resolves.toEqual({
      orgId: second.id,
      role: 'REVIEWER',
    });

    await expect(rememberWorkspace(user.id, foreign.id)).resolves.toBe(false);
    await expect(getPreferredWorkspace(user.id)).resolves.toEqual({
      orgId: second.id,
      role: 'REVIEWER',
    });
  });

  it('falls back deterministically to a current membership when the preference is revoked', async () => {
    await expect(getPreferredWorkspace(user.id)).resolves.toEqual({
      orgId: second.id,
      role: 'REVIEWER',
    });
    await expect(rememberWorkspace(user.id, first.id)).resolves.toBe(true);
    await query(
      'DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2',
      [first.id, user.id],
    );
    try {
      await expect(getPreferredWorkspace(user.id)).resolves.toEqual({
        orgId: second.id,
        role: 'REVIEWER',
      });
    } finally {
      await query(
        `INSERT INTO organization_users (organization_id, user_id, role, created_at)
         VALUES ($1, $2, 'ADMIN', '2025-02-01T00:00:00Z')`,
        [first.id, user.id],
      );
    }
  });
});

describe.skipIf(!hasDb())('workspace-scoped notifications', () => {
  let first: TestOrg;
  let second: TestOrg;
  let user: TestUser;
  let firstNotificationId: string;
  let secondNotificationId: string;

  beforeAll(async () => {
    first = await createTestOrg('notifications-alpha');
    second = await createTestOrg('notifications-beta');
    user = await createTestUser(first);
    await query(
      `INSERT INTO organization_users (organization_id, user_id, role)
       VALUES ($1, $2, 'STAKEHOLDER')`,
      [second.id, user.id],
    );
    firstNotificationId = (await createNotification({
      organizationId: first.id,
      userId: user.id,
      type: 'COMMENT_ADDED',
      title: 'Alpha notification',
      message: 'Alpha only',
    })).id;
    secondNotificationId = (await createNotification({
      organizationId: second.id,
      userId: user.id,
      type: 'COMMENT_ADDED',
      title: 'Beta notification',
      message: 'Beta only',
    })).id;
  });

  beforeEach(async () => {
    await query(
      'UPDATE notifications SET is_read = false WHERE id = ANY($1)',
      [[firstNotificationId, secondNotificationId]],
    );
  });

  afterAll(async () => {
    await cleanupTestOrg(second);
    await cleanupTestOrg(first, [user.id]);
  });

  it('reads and counts notifications only in the requested current workspace', async () => {
    const notifications = await getNotificationsByUser(user.id, first.id, 20);
    expect(notifications.map((notification) => notification.id)).toEqual([firstNotificationId]);
    await expect(getUnreadCount(user.id, first.id)).resolves.toBe(1);
  });

  it('cannot mark another workspace notification through the active workspace', async () => {
    await markAsRead(secondNotificationId, user.id, first.id);
    await markAllAsRead(user.id, first.id);
    const states = await query<{ id: string; is_read: boolean }>(
      'SELECT id, is_read FROM notifications WHERE id = ANY($1) ORDER BY id',
      [[firstNotificationId, secondNotificationId]],
    );
    expect(Object.fromEntries(states.rows.map((row) => [row.id, row.is_read]))).toEqual({
      [firstNotificationId]: true,
      [secondNotificationId]: false,
    });
  });

  it('requires a current membership for notification reads and writes', async () => {
    await query(
      'DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2',
      [first.id, user.id],
    );
    try {
      await expect(getNotificationsByUser(user.id, first.id)).resolves.toEqual([]);
      await expect(getUnreadCount(user.id, first.id)).resolves.toBe(0);
      await markAsRead(firstNotificationId, user.id, first.id);
      await markAllAsRead(user.id, first.id);
      const result = await query<{ is_read: boolean }>(
        'SELECT is_read FROM notifications WHERE id = $1',
        [firstNotificationId],
      );
      expect(result.rows[0].is_read).toBe(false);
    } finally {
      await query(
        `INSERT INTO organization_users (organization_id, user_id, role)
         VALUES ($1, $2, 'STAKEHOLDER')`,
        [first.id, user.id],
      );
    }
  });
});
