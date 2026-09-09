// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg, hasDb } from '@/test/db-helpers';
import { setRequestArchived, bulkSetRequestArchived } from './archive';
import { getFeatureRequestById, listFeatureRequests, searchFeatureRequests } from './feature-requests';
import { beginAgentRun, finishAgentRun } from '@/lib/agents/runs';
import { getDashboardSummary, getStatusDistribution, getUserDashboardStats, getStakeholderEngagement, getBacklogBurndown } from './analytics';

describe.skipIf(!hasDb())('request archive', () => {
  it('preserves request content and workflow, excludes active queries, and restores explicitly', async () => {
    const org = await createTestOrg('archive'), owner = await createTestUser(org), request = await createTestRequest(org, owner);
    try {
      await query("UPDATE feature_requests SET summary='Retained', external_url='https://example.test/linked' WHERE id=$1", [request.id]);
      await query("INSERT INTO comments(request_id,author_id,content) VALUES($1,$2,'Retained discussion')", [request.id, owner.id]);
      await setRequestArchived(request.id, org.id, owner.id, true);
      expect(await getFeatureRequestById(request.id)).toMatchObject({ status: 'DRAFT', summary: 'Retained', externalUrl: 'https://example.test/linked', archivedBy: owner.id });
      expect((await listFeatureRequests(org.id)).total).toBe(0);
      expect((await searchFeatureRequests(org.id)).total).toBe(0);
      expect((await searchFeatureRequests(org.id, { archived: true })).total).toBe(1);
      expect((await getDashboardSummary(org.id)).totalRequests).toBe(0);
      expect(await getStatusDistribution(org.id)).toEqual([]);
      expect((await getUserDashboardStats(org.id, owner.id)).myRequestsCount).toBe(0);
      expect(await getStakeholderEngagement(org.id)).toEqual([]);
      expect((await getBacklogBurndown(org.id)).every(day => day.openCount === 0)).toBe(true);
      await expect(beginAgentRun({ requestId: request.id, orgId: org.id, userId: owner.id, agent: 'intake' })).rejects.toThrow(/archived/i);
      await setRequestArchived(request.id, org.id, owner.id, false);
      expect((await listFeatureRequests(org.id)).total).toBe(1);
      expect((await getFeatureRequestById(request.id))?.archivedAt).toBeNull();
      expect((await query('SELECT content FROM comments WHERE request_id=$1', [request.id])).rows[0].content).toBe('Retained discussion');
      expect((await query("SELECT id FROM activity_log WHERE request_id=$1 AND metadata->>'archiveAction' IN ('ARCHIVE','RESTORE')", [request.id])).rowCount).toBe(2);
    } finally { await cleanupTestOrg(org, [owner.id]); }
  });
  it('checks each bulk item and refuses active work, foreign membership and non-owner drafts', async () => {
    const org = await createTestOrg('archive-auth'), owner = await createTestUser(org), reviewer = await createTestUser(org, 'REVIEWER');
    const request = await createTestRequest(org, owner), other = await createTestRequest(org, reviewer);
    const foreign = await createTestOrg('archive-foreign'), outsider = await createTestUser(foreign, 'ADMIN');
    try {
      const result = await bulkSetRequestArchived([request.id, other.id], org.id, owner.id, true);
      expect(result.map(row => row.success)).toEqual([true, false]);
      await expect(setRequestArchived(other.id, org.id, outsider.id, true)).rejects.toThrow(/membership|not found/);
      await setRequestArchived(request.id, org.id, owner.id, false);
      const run = await beginAgentRun({ requestId: request.id, orgId: org.id, userId: owner.id, agent: 'intake' });
      await expect(setRequestArchived(request.id, org.id, reviewer.id, true)).rejects.toThrow(/active AI/);
      await finishAgentRun(run.id, 'FAILED');
      await expect(setRequestArchived(request.id, org.id, owner.id, true)).rejects.toThrow(/own drafts/);
      await query(`INSERT INTO tracker_exports(request_id,organization_id,provider,destination,items,lease_until)
        VALUES($1,$2,'LINEAR','team','[]',NOW()+interval '1 minute')`, [request.id, org.id]);
      await expect(setRequestArchived(request.id, org.id, reviewer.id, true)).rejects.toThrow(/export/);
      await query('UPDATE tracker_exports SET lease_until=NULL WHERE request_id=$1', [request.id]);
      await setRequestArchived(request.id, org.id, reviewer.id, true);
      expect((await getFeatureRequestById(request.id))?.status).toBe('INTAKE_IN_PROGRESS');
    } finally { await cleanupTestOrg(org, [owner.id, reviewer.id]); await cleanupTestOrg(foreign, [outsider.id]); }
  });
});
