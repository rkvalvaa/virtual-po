// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { setRequestSubscription } from './collaboration';
import { notifyRequestOwner } from './notifications';
import { upsertEmailPreference } from './email-preferences';

describe.skipIf(!hasDb())('request subscriber notifications', () => {
  let org: TestOrg;
  let owner: TestUser;
  let actor: TestUser;
  let subscriber: TestUser;
  let outsiderOrg: TestOrg;
  let outsider: TestUser;
  let requestId: string;

  beforeAll(async () => {
    org = await createTestOrg('subscriber-notifications');
    owner = await createTestUser(org);
    actor = await createTestUser(org, 'REVIEWER');
    subscriber = await createTestUser(org);
    outsiderOrg = await createTestOrg('subscriber-foreign');
    outsider = await createTestUser(outsiderOrg);
    requestId = (await createTestRequest(org, owner, 'Subscriber request')).id;
    await setRequestSubscription(requestId, org.id, subscriber.id, true);
    await setRequestSubscription(requestId, org.id, actor.id, true);
  });

  afterAll(async () => {
    await cleanupTestOrg(outsiderOrg, [outsider.id]);
    await cleanupTestOrg(org, [owner.id, actor.id, subscriber.id]);
  });

  it.each(['STATUS_CHANGED', 'DECISION_MADE'] as const)('deduplicates owner and current subscribers for %s', async type => {
    await notifyRequestOwner({
      organizationId: org.id,
      requesterId: outsider.id,
      type,
      title: `Event ${type}`,
      message: 'Request changed',
      link: `/requests/${requestId}`,
      requestId,
      actorId: actor.id,
    });
    const result = await query<{ user_id: string; count: number }>(
      `SELECT user_id, COUNT(*)::int AS count FROM notifications
       WHERE organization_id=$1 AND request_id=$2 AND title=$3
       GROUP BY user_id`,
      [org.id, requestId, `Event ${type}`],
    );
    expect(Object.fromEntries(result.rows.map(row => [row.user_id, row.count]))).toEqual({
      [owner.id]: 1,
      [subscriber.id]: 1,
    });
  });

  it('applies each subscriber email preference while keeping in-app delivery', async () => {
    await upsertEmailPreference(subscriber.id, org.id, 'STATUS_CHANGED', false);
    await notifyRequestOwner({
      organizationId: org.id,
      requesterId: owner.id,
      type: 'STATUS_CHANGED',
      title: 'Preference event',
      message: 'Status changed',
      link: `/requests/${requestId}`,
      requestId,
      actorId: actor.id,
    });
    const rows = await query<{ user_id: string; delivery_id: string | null }>(
      `SELECT n.user_id, d.id AS delivery_id FROM notifications n
       LEFT JOIN email_deliveries d ON d.notification_id=n.id
       WHERE n.organization_id=$1 AND n.request_id=$2 AND n.title='Preference event'
       ORDER BY n.user_id`,
      [org.id, requestId],
    );
    expect(rows.rows).toEqual(expect.arrayContaining([
      { user_id: owner.id, delivery_id: expect.any(String) },
      { user_id: subscriber.id, delivery_id: null },
    ]));
  });

  it('does not fan out unrelated owner-only events to subscribers', async () => {
    await notifyRequestOwner({
      organizationId: org.id,
      requesterId: owner.id,
      type: 'VOTE_RECEIVED',
      title: 'Vote event',
      message: 'Vote received',
      link: `/requests/${requestId}`,
      requestId,
      actorId: actor.id,
    });
    const users = await query<{ user_id: string }>(
      `SELECT user_id FROM notifications WHERE organization_id=$1 AND request_id=$2 AND title='Vote event'`,
      [org.id, requestId],
    );
    expect(users.rows).toEqual([{ user_id: owner.id }]);
  });
});
