// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { listRequestQueue } from './request-queue';
describe.skipIf(!hasDb())('complete request queue pagination', () => {
  let org: TestOrg, user: TestUser;
  beforeAll(async () => {
    org = await createTestOrg('queue'); user = await createTestUser(org);
    await query(`INSERT INTO feature_requests (organization_id, requester_id, title, status, priority_score, created_at)
      SELECT $1, $2, 'Queue item ' || n, 'UNDER_REVIEW', CASE WHEN n = 1 THEN 100 ELSE 10 END,
        NOW() - n * INTERVAL '1 minute' FROM generate_series(1, 51) n`, [org.id, user.id]);
    await query("UPDATE feature_requests SET created_at = NOW() - INTERVAL '1 year' WHERE organization_id = $1 AND priority_score = 100", [org.id]);
    await query(`INSERT INTO feature_requests (organization_id, requester_id, title, status, priority_score)
      VALUES ($1, $2, 'Needs information', 'NEEDS_INFO', 90), ($1, $2, 'Unscored', 'UNDER_REVIEW', NULL),
      ($1, $2, 'Backlog item', 'APPROVED', 99), ($1, $2, 'In progress', 'IN_PROGRESS', 50), ($1, $2, 'Done', 'COMPLETED', 20)`, [org.id, user.id]);
  });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });
  it('puts the oldest highest-priority row first across statuses and retains true totals', async () => {
    const first = await listRequestQueue(org.id, 'review', {});
    expect(first.total).toBe(53);
    expect(first.requests).toHaveLength(25);
    expect(first.requests.slice(0, 2).map(row => row.title)).toEqual(['Queue item 1', 'Needs information']);
    const second = await listRequestQueue(org.id, 'review', { offset: '25' });
    const third = await listRequestQueue(org.id, 'review', { offset: '50' });
    const all = [...first.requests, ...second.requests, ...third.requests];
    expect(new Set(all.map(row => row.id)).size).toBe(53);
    expect(all[52].title).toBe('Unscored');
  });
  it('keeps status filters and search within the selected queue', async () => {
    const review = await listRequestQueue(org.id, 'review', { status: 'APPROVED' });
    expect(review.requests.every(row => ['UNDER_REVIEW', 'NEEDS_INFO'].includes(row.status))).toBe(true);
    expect((await listRequestQueue(org.id, 'review', { search: 'Backlog' })).total).toBe(0);
    expect((await listRequestQueue(org.id, 'backlog', {})).total).toBe(3);
    expect((await listRequestQueue(org.id, 'review', { status: 'NEEDS_INFO' })).total).toBe(1);
  });
  it('normalizes invalid offsets and recovers from pages beyond the last row', async () => {
    expect((await listRequestQueue(org.id, 'review', { offset: '-10' })).offset).toBe(0);
    expect((await listRequestQueue(org.id, 'review', { offset: 'NaN' })).offset).toBe(0);
    const last = await listRequestQueue(org.id, 'review', { offset: '9999' });
    expect(last.offset).toBe(50); expect(last.requests).toHaveLength(3);
  });
});
