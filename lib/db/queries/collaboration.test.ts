// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import {
  cleanupTestOrg,
  createTestOrg,
  createTestRequest,
  createTestUser,
  hasDb,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers';
import {
  createCommentWithMentions,
  getRequestSubscription,
  listCommentNotificationRecipients,
  listMentionableMembers,
  setRequestSubscription,
} from './collaboration';
import { getCommentsWithAuthorByRequestId } from './comments';
import { notifyCommentParticipants } from '@/lib/collaboration/comment-notifications';

describe.skipIf(!hasDb())('request mentions and subscriptions', () => {
  let org: TestOrg;
  let foreign: TestOrg;
  let owner: TestUser;
  let actor: TestUser;
  let teammate: TestUser;
  let outsider: TestUser;
  let requestId: string;

  beforeAll(async () => {
    org = await createTestOrg('collaboration');
    foreign = await createTestOrg('collaboration-foreign');
    owner = await createTestUser(org);
    actor = await createTestUser(org);
    teammate = await createTestUser(org);
    outsider = await createTestUser(foreign);
    requestId = (await createTestRequest(org, owner, 'Mention-safe request')).id;
  });

  afterAll(async () => {
    await cleanupTestOrg(foreign, [outsider.id]);
    await cleanupTestOrg(org, [owner.id, actor.id, teammate.id]);
  });

  it('lists only current request-organization members for an authorized picker', async () => {
    const members = await listMentionableMembers(requestId, org.id, actor.id);
    expect(members.map(member => member.id)).toEqual(expect.arrayContaining([owner.id, teammate.id]));
    expect(members.map(member => member.id)).not.toContain(actor.id);
    expect(members.map(member => member.id)).not.toContain(outsider.id);
    await expect(listMentionableMembers(requestId, org.id, outsider.id)).resolves.toEqual([]);
  });

  it('rejects cross-organization mention IDs without writing a comment', async () => {
    await expect(createCommentWithMentions({
      requestId,
      orgId: org.id,
      authorId: actor.id,
      content: `Hello @${outsider.email}`,
      mentionedUserIds: [outsider.id],
    })).rejects.toThrow(/current workspace member/i);
    const rows = await query('SELECT id FROM comments WHERE request_id=$1', [requestId]);
    expect(rows.rowCount).toBe(0);
  });

  it('persists unique following and requires current request access', async () => {
    await expect(setRequestSubscription(requestId, org.id, teammate.id, true)).resolves.toBe(true);
    await expect(setRequestSubscription(requestId, org.id, teammate.id, true)).resolves.toBe(true);
    await expect(getRequestSubscription(requestId, org.id, teammate.id)).resolves.toBe(true);
    expect((await query('SELECT * FROM request_subscriptions WHERE request_id=$1 AND user_id=$2', [requestId, teammate.id])).rowCount).toBe(1);
    await expect(setRequestSubscription(requestId, org.id, outsider.id, true)).resolves.toBe(false);
    await expect(setRequestSubscription(requestId, foreign.id, teammate.id, true)).resolves.toBe(false);
  });

  it('deduplicates owner, subscriber and mention recipients and excludes the actor', async () => {
    await setRequestSubscription(requestId, org.id, teammate.id, true);
    await setRequestSubscription(requestId, org.id, actor.id, true);
    const recipients = await listCommentNotificationRecipients(
      requestId,
      org.id,
      actor.id,
      [owner.id, teammate.id, actor.id, teammate.id],
    );
    expect(recipients).toEqual([
      { userId: owner.id, mentioned: true },
      { userId: teammate.id, mentioned: true },
    ]);
  });

  it('creates one notification per recipient and applies email preferences', async () => {
    await query(
      `INSERT INTO email_preferences (user_id, organization_id, notification_type, email_enabled)
       VALUES ($1, $2, 'COMMENT_ADDED', false)
       ON CONFLICT (user_id, organization_id, notification_type)
       DO UPDATE SET email_enabled=false`,
      [owner.id, org.id],
    );
    await notifyCommentParticipants({
      orgId: org.id,
      requestId,
      actorId: actor.id,
      actorName: 'Comment author',
      requestTitle: 'Mention-safe request',
      mentionedUserIds: [owner.id, teammate.id, teammate.id],
    });
    const notifications = await query<{ user_id: string; count: number }>(
      `SELECT user_id, COUNT(*)::int AS count FROM notifications
       WHERE organization_id=$1 AND request_id=$2 AND actor_id=$3
       GROUP BY user_id ORDER BY user_id`,
      [org.id, requestId, actor.id],
    );
    expect(Object.fromEntries(notifications.rows.map(row => [row.user_id, row.count]))).toEqual({
      [owner.id]: 1,
      [teammate.id]: 1,
    });
    const deliveries = await query<{ recipient_user_id: string; count: number }>(
      `SELECT recipient_user_id, COUNT(*)::int AS count FROM email_deliveries
       WHERE organization_id=$1 AND notification_id IN (
         SELECT id FROM notifications WHERE request_id=$2 AND actor_id=$3
       ) GROUP BY recipient_user_id`,
      [org.id, requestId, actor.id],
    );
    expect(Object.fromEntries(deliveries.rows.map(row => [row.recipient_user_id, row.count]))).toEqual({
      [teammate.id]: 1,
    });
  });

  it('retains readable mention names but stops notifying after membership removal', async () => {
    const created = await createCommentWithMentions({
      requestId,
      orgId: org.id,
      authorId: actor.id,
      content: 'Please review this.',
      mentionedUserIds: [teammate.id],
    });
    expect(created.mentions[0]).toMatchObject({ userId: teammate.id });
    const before = await getCommentsWithAuthorByRequestId(requestId);
    expect(before.find(comment => comment.id === created.comment.id)?.mentionNames[0]).toMatch(/^User /);

    await query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [org.id, teammate.id]);
    const after = await getCommentsWithAuthorByRequestId(requestId);
    expect(after.find(comment => comment.id === created.comment.id)?.mentionNames).toEqual(before.find(comment => comment.id === created.comment.id)?.mentionNames);
    await expect(listCommentNotificationRecipients(requestId, org.id, actor.id, [teammate.id])).resolves.toEqual([
      { userId: owner.id, mentioned: false },
    ]);
  });
});
