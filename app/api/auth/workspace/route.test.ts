// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';
const session = vi.hoisted(() => ({ user: null as null | { id: string; orgId: string; role: string; email: string } }));
vi.mock('@/auth', () => ({ auth: async () => session }));
describe('read-only workspace session check', () => {
  it('returns only authorization metadata without rotating the shared cookie', async () => {
    session.user = { id: 'user', orgId: 'org', role: 'ADMIN', email: 'private@example.test' };
    const response = await GET();
    expect(await response.json()).toEqual({ user: { id: 'user', orgId: 'org', role: 'ADMIN' } });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('does not expose authority for a revoked session', async () => {
    session.user = null;
    expect(await (await GET()).json()).toEqual({ user: null });
  });
});
