// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSetupChecklistDismissed } from './setup-actions';

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; orgId: string | null } },
  currentMember: true,
  stored: null as boolean | null,
}));

vi.mock('@/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db/queries/setup', () => ({
  setWorkspaceSetupDismissed: async (orgId: string, userId: string, dismissed: boolean) => {
    if (!state.currentMember || orgId !== 'org' || userId !== 'user') return false;
    state.stored = dismissed;
    return true;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

describe('setup checklist dismissal action', () => {
  beforeEach(() => {
    state.session = { user: { id: 'user', orgId: 'org' } };
    state.currentMember = true;
    state.stored = null;
  });

  it('rejects a missing session or organization context', async () => {
    state.session = null;
    await expect(setSetupChecklistDismissed(true)).resolves.toMatchObject({ success: false });
    state.session = { user: { id: 'user', orgId: null } };
    await expect(setSetupChecklistDismissed(true)).resolves.toMatchObject({ success: false });
    expect(state.stored).toBeNull();
  });

  it('dismisses and resumes for the authenticated workspace member', async () => {
    await expect(setSetupChecklistDismissed(true)).resolves.toEqual({ success: true });
    expect(state.stored).toBe(true);
    await expect(setSetupChecklistDismissed(false)).resolves.toEqual({ success: true });
    expect(state.stored).toBe(false);
  });

  it('fails when membership was revoked before the write', async () => {
    state.currentMember = false;
    await expect(setSetupChecklistDismissed(true)).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/membership/i),
    });
    expect(state.stored).toBeNull();
  });
});
