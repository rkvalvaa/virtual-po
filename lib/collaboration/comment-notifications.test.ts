import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyCommentParticipants } from './comment-notifications';

const mocks = vi.hoisted(() => ({
  recipients: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock('@/lib/db/queries/collaboration', () => ({ listCommentNotificationRecipients: mocks.recipients }));
vi.mock('@/lib/db/queries/notifications', () => ({ notifyUser: mocks.notifyUser }));

describe('comment participant notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls notifyUser once per deduplicated recipient with mention precedence', async () => {
    mocks.recipients.mockResolvedValue([
      { userId: 'owner', mentioned: false },
      { userId: 'mentioned-subscriber', mentioned: true },
    ]);
    await notifyCommentParticipants({
      orgId: 'org', requestId: 'request', actorId: 'actor', actorName: 'Alice',
      requestTitle: 'Roadmap', mentionedUserIds: ['mentioned-subscriber'],
    });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(2);
    expect(mocks.notifyUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', type: 'COMMENT_ADDED', title: 'New comment' }));
    expect(mocks.notifyUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'mentioned-subscriber', type: 'COMMENT_ADDED', title: 'You were mentioned' }));
  });
});
