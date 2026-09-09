import { listCommentNotificationRecipients } from '@/lib/db/queries/collaboration';
import { notifyUser } from '@/lib/db/queries/notifications';

export async function notifyCommentParticipants(params: {
  orgId: string;
  requestId: string;
  actorId: string;
  actorName: string;
  requestTitle: string;
  mentionedUserIds: string[];
}): Promise<void> {
  const recipients = await listCommentNotificationRecipients(
    params.requestId,
    params.orgId,
    params.actorId,
    params.mentionedUserIds,
  );
  for (const recipient of recipients) {
    await notifyUser({
      organizationId: params.orgId,
      userId: recipient.userId,
      type: 'COMMENT_ADDED',
      title: recipient.mentioned ? 'You were mentioned' : 'New comment',
      message: `${params.actorName} commented on "${params.requestTitle}"`,
      link: `/requests/${params.requestId}`,
      requestId: params.requestId,
      actorId: params.actorId,
    });
  }
}
