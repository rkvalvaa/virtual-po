// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestOrg, createTestUser, cleanupTestOrg, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { connectRepo, disconnectRepo } from './actions';
import { getUserRepos } from '@/lib/github/client';
import { connectRepository, getRepositoryById } from '@/lib/db/queries/repositories';

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'ADMIN' }));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/github/client', () => ({ getGitHubToken: vi.fn(async () => 'mock-provider-token'), getUserRepos: vi.fn() }));
describe.skipIf(!hasDb())('repository configuration boundaries', () => {
  let org: TestOrg, user: TestUser;
  beforeAll(async () => { org = await createTestOrg('repo-admin'); user = await createTestUser(org, 'ADMIN'); Object.assign(actor, { id: user.id, orgId: org.id }); });
  beforeEach(async () => {
    actor.role = 'ADMIN';
    await query("UPDATE organization_users SET role = 'ADMIN' WHERE organization_id = $1 AND user_id = $2", [org.id, user.id]);
    await query('DELETE FROM repositories WHERE organization_id = $1', [org.id]);
    vi.mocked(getUserRepos).mockResolvedValue([{ id: 42, owner: 'verified', name: 'repo', fullName: 'verified/repo', defaultBranch: 'main', description: null, language: null, isPrivate: true, updatedAt: '' }]);
  });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });
  it.each(['STAKEHOLDER', 'REVIEWER'])('denies %s connect and disconnect actions', async role => {
    actor.role = role;
    expect(await Reflect.apply(connectRepo, undefined, [42, 'forged', 'repo', 'forged/repo', 'evil'])).toMatchObject({ success: false });
    expect(await disconnectRepo('00000000-0000-0000-0000-000000000000')).toMatchObject({ success: false });
    expect((await query('SELECT id FROM repositories WHERE organization_id = $1', [org.id])).rows).toHaveLength(0);
  });
  it('uses provider metadata even when a direct caller submits forged fields', async () => {
    await connectRepository(org.id, 42, 'stale', 'repo', 'stale/repo', 'outdated', user.id);
    expect(await Reflect.apply(connectRepo, undefined, [42, 'forged', 'repo', 'forged/repo', 'evil'])).toMatchObject({ success: true });
    const row = (await query('SELECT * FROM repositories WHERE organization_id = $1', [org.id])).rows[0];
    expect(row).toMatchObject({ owner: 'verified', full_name: 'verified/repo', default_branch: 'main' });
    expect(await disconnectRepo(row.id)).toMatchObject({ success: true });
  });
  it('does not disconnect another organization’s repository', async () => {
    const foreignOrg = await createTestOrg('foreign-repository');
    const foreignUser = await createTestUser(foreignOrg, 'ADMIN');
    try {
      const repository = await connectRepository(foreignOrg.id, 42, 'verified', 'repo', 'verified/repo', 'main', foreignUser.id);
      expect(await disconnectRepo(repository.id)).toMatchObject({ success: false });
      expect(await getRepositoryById(repository.id)).toMatchObject({ isActive: true });
    } finally { await cleanupTestOrg(foreignOrg, [foreignUser.id]); }
  });
  it('rejects repositories that the authenticated provider cannot verify', async () => {
    expect(await Reflect.apply(connectRepo, undefined, [999, 'forged', 'repo', 'forged/repo', 'evil'])).toMatchObject({ success: false });
    expect((await query('SELECT id FROM repositories WHERE organization_id = $1', [org.id])).rows).toHaveLength(0);
  });
  it('rechecks admin membership after provider access instead of trusting a stale role', async () => {
    vi.mocked(getUserRepos).mockImplementationOnce(async () => {
      await query("UPDATE organization_users SET role = 'STAKEHOLDER' WHERE organization_id = $1 AND user_id = $2", [org.id, user.id]);
      return [{ id: 42, owner: 'verified', name: 'repo', fullName: 'verified/repo', defaultBranch: 'main', description: null, language: null, isPrivate: true, updatedAt: '' }];
    });
    expect(await connectRepo(42)).toMatchObject({ success: false });
    expect((await query('SELECT id FROM repositories WHERE organization_id = $1', [org.id])).rows).toHaveLength(0);
  });
});
