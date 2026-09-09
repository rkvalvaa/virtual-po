// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { createEpic, createUserStory, getEpicByRequestId, getStoriesByEpicId } from '@/lib/db/queries/epics';
import { upsertIntegration } from '@/lib/db/queries/jira-sync';
import { query } from '@/lib/db/pool';
import { updateEpicLinearKeys, updateStoryLinearKeys } from '@/lib/db/queries/linear-sync';
import { updateEpicJiraKeys, updateStoryJiraKeys } from '@/lib/db/queries/jira-sync';
import { updateEpicGitHubKeys, updateStoryGitHubKeys } from '@/lib/db/queries/github-sync';
import { syncEpicToLinear } from './linear-actions';
import { syncEpicToJira } from './jira-actions';
import { syncToGitHubIssues } from './github-issues-actions';

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'REVIEWER' }));
const provider = vi.hoisted(() => ({
  createProject: vi.fn(), createIssue: vi.fn(), updateIssue: vi.fn(),
  getTeams: vi.fn(), getProjects: vi.fn(), listLabels: vi.fn(),
  getIssue: vi.fn(), getProject: vi.fn(), searchIssues: vi.fn(), findExport: vi.fn(), addIssueToProject: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/linear/client', () => ({ getLinearClientFromIntegration: () => provider }));
vi.mock('@/lib/jira/client', () => ({ getJiraClientFromIntegration: () => provider }));
vi.mock('@/lib/github/issues-client', () => ({ getGitHubIssuesClientFromToken: () => provider }));
vi.mock('@/lib/github/client', () => ({ getGitHubToken: async () => 'test-token' }));

describe.skipIf(!hasDb())('tracker export authorization (CCT-2059)', () => {
  let org: TestOrg, foreign: TestOrg, user: TestUser;
  const actions = [
    { name: 'Linear', run: syncEpicToLinear },
    { name: 'Jira', run: syncEpicToJira },
    { name: 'GitHub', run: syncToGitHubIssues },
  ];
  beforeAll(async () => {
    org = await createTestOrg('export-owner');
    foreign = await createTestOrg('export-foreign');
    user = await createTestUser(org, 'REVIEWER');
    Object.assign(actor, { id: user.id, orgId: org.id });
    await upsertIntegration(org.id, 'LINEAR', 'Linear', { defaultTeamId: 'allowed-team' });
    await upsertIntegration(org.id, 'JIRA', 'Jira', { defaultProjectKey: 'ALLOWED', baseUrl: 'https://example.atlassian.net' });
    await upsertIntegration(org.id, 'GITHUB_ISSUES', 'GitHub', { defaultRepo: 'owner/allowed' });
  });
  afterAll(async () => { await cleanupTestOrg(foreign); await cleanupTestOrg(org, [user.id]); });
  beforeEach(() => {
    vi.resetAllMocks();
    actor.role = 'REVIEWER';
    provider.createProject.mockResolvedValue({ id: 'project', url: 'https://linear.app/project' });
    provider.createIssue.mockResolvedValue({ id: 'issue', key: 'ALLOWED-1', number: 1, html_url: 'https://github.com/owner/allowed/issues/1', url: 'https://linear.app/issue', node_id: 'node' });
    provider.getTeams.mockResolvedValue([{ id: 'allowed-team', name: 'Allowed', key: 'A' }]);
    provider.getProjects.mockResolvedValue([{ id: 'project', key: 'ALLOWED', name: 'Allowed' }]);
    provider.listLabels.mockResolvedValue([]);
    provider.searchIssues.mockResolvedValue({ issues: [] });
    provider.findExport.mockResolvedValue(null);
  });
  async function fixture(target: TestOrg) {
    const request = await createTestRequest(target, user);
    const epic = await createEpic({ requestId: request.id, title: 'Private epic' });
    await createUserStory({ epicId: epic.id, title: 'Private story', asA: 'user', iWant: 'privacy', soThat: 'data stays private', acceptanceCriteria: ['Only members can read'], technicalNotes: 'Use tenant filters', storyPoints: 5 }, { requestId: request.id, orgId: target.id });
    return { request, epic };
  }
  for (const action of actions) {
    it(`${action.name} rejects a foreign request without calls or writes`, async () => {
      const { request, epic } = await fixture(foreign);
      const beforeEpic = await getEpicByRequestId(request.id);
      const beforeStories = await getStoriesByEpicId(epic.id);
      expect(await action.run(request.id)).toMatchObject({ success: false });
      for (const call of Object.values(provider)) expect(call).not.toHaveBeenCalled();
      expect(await getEpicByRequestId(request.id)).toEqual(beforeEpic);
      expect(await getStoriesByEpicId(epic.id)).toEqual(beforeStories);
      const logs = await query(`SELECT entity_id FROM linear_sync_log WHERE organization_id = $1 UNION ALL SELECT entity_id FROM jira_sync_log WHERE organization_id = $1 UNION ALL SELECT entity_id FROM github_sync_log WHERE organization_id = $1`, [org.id]);
      expect(logs.rows.some(row => row.entity_id === epic.id)).toBe(false);
    });
    it(`${action.name} exports a request belonging to the session organization`, async () => {
      const { request } = await fixture(org);
      expect(await action.run(request.id)).toMatchObject({ success: true });
      expect(provider.createIssue).toHaveBeenCalled();
    });
    it(`${action.name} rejects an invalid destination before creating content`, async () => {
      const { request } = await fixture(org);
      expect(await action.run(request.id, 'unknown/destination')).toMatchObject({ success: false });
      expect(provider.createProject).not.toHaveBeenCalled();
      expect(provider.createIssue).not.toHaveBeenCalled();
    });
    it(`${action.name} rejects stakeholders`, async () => {
      const { request } = await fixture(org);
      actor.role = 'STAKEHOLDER';
      expect(await action.run(request.id)).toMatchObject({ success: false });
      for (const call of Object.values(provider)) expect(call).not.toHaveBeenCalled();
    });
    it(`${action.name} preserves full story content and repeated exports create nothing`, async () => {
      const { request } = await fixture(org);
      expect(await action.run(request.id)).toMatchObject({ success: true });
      const calls = provider.createIssue.mock.calls.length;
      expect(JSON.stringify(provider.createIssue.mock.calls)).toContain('Only members can read');
      expect(JSON.stringify(provider.createIssue.mock.calls)).toContain('Use tenant filters');
      expect(JSON.stringify(provider.createIssue.mock.calls)).toContain('Story points: 5');
      expect(JSON.stringify(provider.createIssue.mock.calls)).toContain('Priority order: 1');
      expect(await action.run(request.id)).toMatchObject({ success: true });
      expect(provider.createIssue).toHaveBeenCalledTimes(calls);
    });
    it(`${action.name} recovers a child created before a timeout without a duplicate`, async () => {
      const { request } = await fixture(org);
      const created = { id: 'recovered', key: 'ALLOWED-2', number: 2, html_url: 'https://github.com/owner/allowed/issues/2', url: 'https://linear.app/recovered', node_id: 'node2' };
      if (action.name !== 'Linear') provider.createIssue.mockResolvedValueOnce({ ...created, key: 'ALLOWED-1', number: 1 });
      provider.createIssue.mockRejectedValueOnce(new Error('Timeout after creation'));
      expect(await action.run(request.id)).toMatchObject({ success: false, status: 'partial' });
      const calls = provider.createIssue.mock.calls.length;
      provider.getIssue.mockResolvedValue(created);
      provider.searchIssues.mockResolvedValue({ issues: [created] });
      provider.findExport.mockResolvedValue(created);
      expect(await action.run(request.id)).toMatchObject({ success: true });
      expect(provider.createIssue).toHaveBeenCalledTimes(calls);
    });
    it(`${action.name} prevents export of unapproved human revisions`, async () => {
      const { request } = await fixture(org);
      await query("UPDATE feature_requests SET human_refined = true, status = 'UNDER_REVIEW' WHERE id = $1", [request.id]);
      expect(await action.run(request.id)).toMatchObject({ success: false, error: 'Approve the revised request before exporting.' });
      expect(provider.createIssue).not.toHaveBeenCalled();
      expect(provider.createProject).not.toHaveBeenCalled();
    });
  }
  it('scopes content reads and external-key writes to both request and organization', async () => {
    const { request, epic } = await fixture(foreign);
    const beforeEpic = await getEpicByRequestId(request.id);
    const beforeStories = await getStoriesByEpicId(epic.id);
    const other = await fixture(foreign);
    for (const scope of [{ requestId: request.id, orgId: org.id }, { requestId: other.request.id, orgId: foreign.id }]) {
      expect(await getStoriesByEpicId(epic.id, scope)).toEqual([]);
      await expect(updateEpicLinearKeys(epic.id, 'external', 'https://example.test', scope)).rejects.toThrow();
      await expect(updateStoryLinearKeys(beforeStories[0].id, 'external', 'https://example.test', scope)).rejects.toThrow();
      await expect(updateEpicJiraKeys(epic.id, 'EXT-1', 'https://example.test', scope)).rejects.toThrow();
      await expect(updateStoryJiraKeys(beforeStories[0].id, 'EXT-1', 'https://example.test', scope)).rejects.toThrow();
      await expect(updateEpicGitHubKeys(epic.id, 99, 'https://example.test', scope)).rejects.toThrow();
      await expect(updateStoryGitHubKeys(beforeStories[0].id, 99, 'https://example.test', scope)).rejects.toThrow();
    }
    expect(await getEpicByRequestId(request.id, org.id)).toBeNull();
    expect(await getEpicByRequestId(request.id)).toEqual(beforeEpic);
    expect(await getStoriesByEpicId(epic.id)).toEqual(beforeStories);
  });
});
