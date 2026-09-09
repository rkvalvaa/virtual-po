import { mapRow } from '@/lib/db/mappers';
import { query, transaction } from '@/lib/db/pool';
import type { Comment } from '@/lib/types/database';

export interface MentionableMember {
  id: string;
  name: string;
  email: string;
}

export interface StoredMention {
  userId: string;
  displayName: string;
}

export async function listMentionableMembers(
  requestId: string,
  orgId: string,
  viewerId: string,
): Promise<MentionableMember[]> {
  const result = await query<{ id: string; name: string; email: string }>(
    `SELECT candidate.user_id AS id,
            COALESCE(NULLIF(BTRIM(candidate_user.name), ''), candidate_user.email) AS name,
            candidate_user.email
     FROM feature_requests request
     JOIN organization_users viewer
       ON viewer.organization_id = request.organization_id AND viewer.user_id = $3
     JOIN organization_users candidate
       ON candidate.organization_id = request.organization_id AND candidate.user_id <> $3
     JOIN users candidate_user ON candidate_user.id = candidate.user_id
     WHERE request.id = $1 AND request.organization_id = $2
     ORDER BY LOWER(COALESCE(NULLIF(BTRIM(candidate_user.name), ''), candidate_user.email)), candidate.user_id`,
    [requestId, orgId, viewerId],
  );
  return result.rows;
}

export async function createCommentWithMentions(params: {
  requestId: string;
  orgId: string;
  authorId: string;
  content: string;
  parentId?: string;
  mentionedUserIds: string[];
}): Promise<{
  comment: Comment;
  requestTitle: string;
  requesterId: string;
  mentions: StoredMention[];
}> {
  return transaction(async () => {
    const target = await query<{ title: string; requester_id: string }>(
      `SELECT request.title, request.requester_id
       FROM feature_requests request
       JOIN organization_users membership
         ON membership.organization_id = request.organization_id AND membership.user_id = $3
       WHERE request.id = $1 AND request.organization_id = $2
       FOR SHARE OF request, membership`,
      [params.requestId, params.orgId, params.authorId],
    );
    if (target.rowCount !== 1) throw new Error('Feature request not found or membership revoked.');

    if (params.parentId) {
      const parent = await query(
        'SELECT id FROM comments WHERE id = $1 AND request_id = $2',
        [params.parentId, params.requestId],
      );
      if (parent.rowCount !== 1) throw new Error('Reply target does not belong to this request.');
    }

    const uniqueMentionIds = [...new Set(params.mentionedUserIds)];
    const mentionResult = await query<{ user_id: string; display_name: string }>(
      `SELECT membership.user_id,
              COALESCE(NULLIF(BTRIM(member.name), ''), member.email) AS display_name
       FROM organization_users membership
       JOIN users member ON member.id = membership.user_id
       WHERE membership.organization_id = $1
         AND membership.user_id = ANY($2::uuid[])
       ORDER BY membership.user_id
       FOR KEY SHARE OF membership`,
      [params.orgId, uniqueMentionIds],
    );
    if (mentionResult.rows.length !== uniqueMentionIds.length) {
      throw new Error('Every mention must identify a current workspace member.');
    }

    const inserted = await query(
      `INSERT INTO comments (request_id, author_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [params.requestId, params.authorId, params.content, params.parentId ?? null],
    );
    const comment = mapRow<Comment>(inserted.rows[0]);
    if (mentionResult.rows.length > 0) {
      await query(
        `INSERT INTO comment_mentions (comment_id, mentioned_user_id, display_name)
         SELECT $1, mention.user_id, mention.display_name
         FROM UNNEST($2::uuid[], $3::text[]) AS mention(user_id, display_name)`,
        [
          comment.id,
          mentionResult.rows.map(row => row.user_id),
          mentionResult.rows.map(row => row.display_name),
        ],
      );
    }
    return {
      comment,
      requestTitle: target.rows[0].title,
      requesterId: target.rows[0].requester_id,
      mentions: mentionResult.rows.map(row => ({ userId: row.user_id, displayName: row.display_name })),
    };
  });
}

export async function getRequestSubscription(
  requestId: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const result = await query<{ subscribed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM feature_requests request
       JOIN organization_users membership
         ON membership.organization_id = request.organization_id AND membership.user_id = $3
       JOIN request_subscriptions subscription
         ON subscription.request_id = request.id
        AND subscription.organization_id = request.organization_id
        AND subscription.user_id = $3
       WHERE request.id = $1 AND request.organization_id = $2
     ) AS subscribed`,
    [requestId, orgId, userId],
  );
  return result.rows[0].subscribed;
}

export async function setRequestSubscription(
  requestId: string,
  orgId: string,
  userId: string,
  subscribed: boolean,
): Promise<boolean> {
  if (subscribed) {
    const result = await query(
      `INSERT INTO request_subscriptions (organization_id, request_id, user_id)
       SELECT request.organization_id, request.id, membership.user_id
       FROM feature_requests request
       JOIN organization_users membership
         ON membership.organization_id = request.organization_id AND membership.user_id = $3
       WHERE request.id = $1 AND request.organization_id = $2
       ON CONFLICT (request_id, user_id)
       DO UPDATE SET organization_id = EXCLUDED.organization_id
       RETURNING request_id`,
      [requestId, orgId, userId],
    );
    return result.rowCount === 1;
  }
  const result = await query<{ authorized: boolean }>(
    `WITH authorized AS (
       SELECT request.id
       FROM feature_requests request
       JOIN organization_users membership
         ON membership.organization_id = request.organization_id AND membership.user_id = $3
       WHERE request.id = $1 AND request.organization_id = $2
     ), deleted AS (
       DELETE FROM request_subscriptions subscription
       WHERE subscription.request_id = $1
         AND subscription.organization_id = $2
         AND subscription.user_id = $3
         AND EXISTS (SELECT 1 FROM authorized)
       RETURNING request_id
     )
     SELECT EXISTS (SELECT 1 FROM authorized) AS authorized`,
    [requestId, orgId, userId],
  );
  return result.rows[0]?.authorized === true;
}

export async function listCommentNotificationRecipients(
  requestId: string,
  orgId: string,
  actorId: string,
  mentionedUserIds: string[],
): Promise<Array<{ userId: string; mentioned: boolean }>> {
  const result = await query<{ user_id: string; mentioned: boolean }>(
    `WITH target AS (
       SELECT request.id, request.organization_id, request.requester_id
       FROM feature_requests request
       JOIN organization_users actor
         ON actor.organization_id = request.organization_id AND actor.user_id = $3
       WHERE request.id = $1 AND request.organization_id = $2
     ), candidates AS (
       SELECT target.requester_id AS user_id, false AS mentioned, 0 AS priority FROM target
       UNION ALL
       SELECT subscription.user_id, false, 1
       FROM request_subscriptions subscription JOIN target ON target.id = subscription.request_id
       UNION ALL
       SELECT mention.user_id, true, 2
       FROM UNNEST($4::uuid[]) AS mention(user_id) JOIN target ON true
     ), candidate_summary AS (
       SELECT candidates.user_id,
              BOOL_OR(candidates.mentioned) AS mentioned,
              MIN(candidates.priority) AS priority
       FROM candidates
       WHERE candidates.user_id <> $3
       GROUP BY candidates.user_id
     )
     SELECT candidate_summary.user_id, candidate_summary.mentioned
     FROM candidate_summary
     JOIN organization_users membership
       ON membership.organization_id = $2 AND membership.user_id = candidate_summary.user_id
     ORDER BY candidate_summary.priority, candidate_summary.user_id
     FOR KEY SHARE OF membership`,
    [requestId, orgId, actorId, [...new Set(mentionedUserIds)]],
  );
  return result.rows.map(row => ({ userId: row.user_id, mentioned: row.mentioned }));
}

export async function listRequestEventNotificationRecipients(
  requestId: string,
  orgId: string,
  actorId: string,
  includeSubscribers: boolean,
): Promise<string[]> {
  const result = await query<{ user_id: string }>(
    `WITH target AS (
       SELECT request.id, request.organization_id, request.requester_id
       FROM feature_requests request
       JOIN organization_users actor
         ON actor.organization_id = request.organization_id AND actor.user_id = $3
       WHERE request.id = $1 AND request.organization_id = $2
     ), candidates AS (
       SELECT target.requester_id AS user_id, 0 AS priority FROM target
       UNION ALL
       SELECT subscription.user_id, 1
       FROM request_subscriptions subscription
       JOIN target ON target.id = subscription.request_id
       WHERE $4::boolean
     ), candidate_summary AS (
       SELECT candidates.user_id, MIN(candidates.priority) AS priority
       FROM candidates
       WHERE candidates.user_id <> $3
       GROUP BY candidates.user_id
     )
     SELECT candidate_summary.user_id
     FROM candidate_summary
     JOIN organization_users membership
       ON membership.organization_id = $2 AND membership.user_id = candidate_summary.user_id
     ORDER BY candidate_summary.priority, candidate_summary.user_id
     FOR KEY SHARE OF membership`,
    [requestId, orgId, actorId, includeSubscribers],
  );
  return result.rows.map(row => row.user_id);
}
