"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { transaction } from '@/lib/db/pool';
import {
  createCommentWithMentions,
  setRequestSubscription,
} from '@/lib/db/queries/collaboration';
import { notifyCommentParticipants } from '@/lib/collaboration/comment-notifications';
import { logActivity } from '@/lib/db/queries/activity-log';
import '@/lib/auth/types';

const commentInput = z.object({
  requestId: z.uuid(),
  content: z.string().trim().min(1).max(10_000),
  parentId: z.uuid().optional(),
  mentionedUserIds: z.array(z.uuid()).max(50),
});

export async function addComment(
  requestId: string,
  content: string,
  parentId?: string,
  mentionedUserIds: string[] = [],
): Promise<{ success: true; commentId: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId) throw new Error('No workspace is selected.');
  const parsed = commentInput.safeParse({ requestId, content, parentId, mentionedUserIds });
  if (!parsed.success) throw new Error('Comment or mention selection is invalid.');
  const uniqueMentionIds = [...new Set(parsed.data.mentionedUserIds)];

  const created = await transaction(async () => {
    const result = await createCommentWithMentions({
      requestId: parsed.data.requestId,
      orgId,
      authorId: session.user.id,
      content: parsed.data.content,
      parentId: parsed.data.parentId,
      mentionedUserIds: uniqueMentionIds,
    });
    await notifyCommentParticipants({
      orgId,
      requestId: parsed.data.requestId,
      actorId: session.user.id,
      actorName: session.user.name ?? 'Someone',
      requestTitle: result.requestTitle,
      mentionedUserIds: result.mentions.map(mention => mention.userId),
    });
    return result;
  });

  try {
    await logActivity({
      organizationId: orgId,
      requestId: parsed.data.requestId,
      userId: session.user.id,
      action: 'COMMENT_ADDED',
      entityType: 'COMMENT',
      entityId: created.comment.id,
      metadata: { preview: parsed.data.content.slice(0, 100) },
    });
  } catch { /* Activity logging is non-critical. */ }
  revalidatePath(`/requests/${parsed.data.requestId}`);
  return { success: true, commentId: created.comment.id };
}

export async function setRequestFollowing(
  requestId: string,
  following: boolean,
): Promise<{ success: boolean; following?: boolean; error?: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  const parsed = z.object({ requestId: z.uuid(), following: z.boolean() }).safeParse({ requestId, following });
  if (!orgId || !parsed.success) {
    return { success: false, error: 'Your workspace session is unavailable.' };
  }
  try {
    const updated = await setRequestSubscription(parsed.data.requestId, orgId, session.user.id, parsed.data.following);
    if (!updated) return { success: false, error: 'Your workspace membership changed. Reload and try again.' };
    revalidatePath(`/requests/${parsed.data.requestId}`);
    return { success: true, following: parsed.data.following };
  } catch {
    return { success: false, error: 'Unable to update request notifications. Try again.' };
  }
}
