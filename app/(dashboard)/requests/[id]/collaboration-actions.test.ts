// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addComment, setRequestFollowing } from './collaboration-actions';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'actor', orgId: '00000000-0000-4000-8000-000000000001', name: 'Alice' } } as { user: { id: string; orgId: string | null; name: string | null } } | null,
  create: vi.fn(),
  notify: vi.fn(),
  subscribe: vi.fn(),
  revalidate: vi.fn(),
  transaction: vi.fn(async (work: () => Promise<unknown>) => work()),
}));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => mocks.session }));
vi.mock('@/lib/db/queries/collaboration', () => ({
  createCommentWithMentions: mocks.create,
  setRequestSubscription: mocks.subscribe,
}));
vi.mock('@/lib/collaboration/comment-notifications', () => ({ notifyCommentParticipants: mocks.notify }));
vi.mock('@/lib/db/queries/activity-log', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/db/pool', () => ({ transaction: mocks.transaction }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const requestId = '00000000-0000-4000-8000-000000000002';
const mentionedId = '00000000-0000-4000-8000-000000000003';

describe('request collaboration actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: 'actor', orgId: '00000000-0000-4000-8000-000000000001', name: 'Alice' } };
    mocks.create.mockResolvedValue({ comment: { id: 'comment' }, requestTitle: 'Roadmap', mentions: [{ userId: mentionedId, displayName: 'Bob' }] });
    mocks.subscribe.mockResolvedValue(true);
  });

  it('passes stable mention IDs to authorized persistence and notification delivery', async () => {
    await expect(addComment(requestId, 'Hello @Bob', undefined, [mentionedId, mentionedId])).resolves.toEqual({ success: true, commentId: 'comment' });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserIds: [mentionedId] }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserIds: [mentionedId] }));
  });

  it('rejects malformed mention identifiers before writing', async () => {
    await expect(addComment(requestId, 'Forged', undefined, ['not-a-user'])).rejects.toThrow(/mention/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns an actionable result when following loses authorization', async () => {
    mocks.subscribe.mockResolvedValue(false);
    await expect(setRequestFollowing(requestId, true)).resolves.toMatchObject({ success: false, error: expect.stringMatching(/membership/i) });
  });

  it('rejects a non-boolean following value before persistence', async () => {
    await expect(setRequestFollowing(requestId, 'yes' as unknown as boolean)).resolves.toMatchObject({ success: false });
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
});
