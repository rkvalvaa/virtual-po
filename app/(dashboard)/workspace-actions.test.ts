// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { switchWorkspace } from './workspace-actions';

const state = vi.hoisted(() => ({
  actor: { id: 'user', orgId: '00000000-0000-4000-8000-000000000001', role: 'ADMIN' },
  role: null as string | null,
  changed: false,
  revoked: false,
}));
const target = '00000000-0000-4000-8000-000000000002';
vi.mock('@/auth', () => ({
  auth: async () => ({ user: state.actor }),
  updateSession: async () => {
    if (state.revoked) return { user: state.actor };
    state.changed = true;
    return { user: { ...state.actor, orgId: target, role: state.role } };
  },
}));
vi.mock('@/lib/db/queries/organizations', () => ({ getOrganizationRole: async () => state.role }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

describe('workspace switch action authorization', () => {
  beforeEach(() => { state.role = 'STAKEHOLDER'; state.changed = false; state.revoked = false; });
  it('rejects malformed IDs without changing the session', async () => {
    expect(await switchWorkspace('not-an-id')).toMatchObject({ success: false });
    expect(state.changed).toBe(false);
  });
  it('rejects a nonmembership without changing the session', async () => {
    state.role = null;
    expect(await switchWorkspace(target)).toMatchObject({ success: false });
    expect(state.changed).toBe(false);
  });
  it('allows a current stakeholder membership', async () => {
    expect(await switchWorkspace(target)).toEqual({ success: true });
    expect(state.changed).toBe(true);
  });
  it('does not claim success if membership was revoked during the session update', async () => {
    state.revoked = true;
    expect(await switchWorkspace(target)).toMatchObject({ success: false });
  });
});
