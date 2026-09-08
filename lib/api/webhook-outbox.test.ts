// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { query, transaction } from '@/lib/db/pool';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { claimWebhookDeliveries, processWebhookOutbox, deliverClaimedWebhook, redeliverWebhook, enqueueWebhookTest, listWebhookDeliveries } from './webhook-outbox';
import { postWebhook } from './webhook-http';
import { WEBHOOK_EVENTS } from '@/lib/types/database';
import { createEpic, createUserStory } from '@/lib/db/queries/epics';
import { createDecision } from '@/lib/db/queries/decisions';
import { createSecurityReview } from '@/lib/db/queries/security-reviews';
vi.mock('./webhook-http', () => ({ postWebhook: vi.fn(async () => 200) }));
describe.skipIf(!hasDb())('durable webhook delivery', () => {
  let org: TestOrg, user: TestUser;
  beforeAll(async () => {
    org = await createTestOrg('outbox'); user = await createTestUser(org);
    await query(`INSERT INTO webhook_subscriptions(organization_id,url,secret,events) VALUES($1,'https://example.com/hook','test-secret','{request.created}')`, [org.id]);
  });
  beforeEach(async () => {
    await query('DELETE FROM webhook_events WHERE organization_id=$1', [org.id]);
    vi.mocked(postWebhook).mockReset().mockResolvedValue(200);
  });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });
  it('commits the event with the request and rolls both back on mutation failure', async () => {
    await expect(transaction(async () => { await createTestRequest(org, user); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect((await query('SELECT id FROM webhook_events WHERE organization_id=$1', [org.id])).rows).toHaveLength(0);
    await createTestRequest(org, user);
    expect((await query('SELECT id FROM webhook_events WHERE organization_id=$1', [org.id])).rows).toHaveLength(1);
    expect(postWebhook).not.toHaveBeenCalled();
  });
  it('captures all eight advertised events from domain mutations without duplicate events on no-op updates', async () => {
    await query('UPDATE webhook_subscriptions SET events=$2 WHERE organization_id=$1', [org.id, WEBHOOK_EVENTS]);
    try {
      const request = await createTestRequest(org, user);
      await query(`UPDATE feature_requests SET status='PENDING_ASSESSMENT',assessment_data='{"complete":true}',priority_score=42 WHERE id=$1`, [request.id]);
      await query('UPDATE feature_requests SET title=title,updated_at=now() WHERE id=$1', [request.id]);
      const epic = await createEpic({ requestId: request.id, title: 'Event epic' });
      await createUserStory({ epicId: epic.id, title: 'Event story', asA: 'user', iWant: 'notifications', soThat: 'I know' }, { requestId: request.id, orgId: org.id });
      await createDecision(request.id, user.id, 'APPROVE', 'Verified');
      await createSecurityReview({ requestId: request.id, organizationId: org.id, categories: [], overallSeverity: 'none', summary: 'Reviewed', recommendations: [], requiresSecurityReview: false, gaps: [] });
      const events = await query('SELECT event_type,body FROM webhook_events WHERE organization_id=$1', [org.id]);
      expect(events.rows.map(row => row.event_type).sort()).toEqual([...WEBHOOK_EVENTS].sort());
      expect(events.rows.every(row => JSON.parse(row.body).payload.requestId === request.id)).toBe(true);
    } finally { await query("UPDATE webhook_subscriptions SET events='{request.created}' WHERE organization_id=$1", [org.id]); }
  });
  it('retries a recipient outage with an unchanged event ID and body', async () => {
    await createTestRequest(org, user);
    vi.mocked(postWebhook).mockResolvedValueOnce(503).mockResolvedValueOnce(200);
    await processWebhookOutbox({ orgId: org.id });
    await query(`UPDATE webhook_deliveries SET next_attempt_at=clock_timestamp() WHERE event_id IN (SELECT id FROM webhook_events WHERE organization_id=$1)`, [org.id]);
    await processWebhookOutbox({ orgId: org.id });
    expect(postWebhook).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postWebhook).mock.calls[0][1]).toBe(vi.mocked(postWebhook).mock.calls[1][1]);
    const delivery = await query('SELECT status,attempt_count FROM webhook_deliveries WHERE event_id IN (SELECT id FROM webhook_events WHERE organization_id=$1)', [org.id]);
    expect(delivery.rows).toEqual([{ status: 'SUCCEEDED', attempt_count: 2 }]);
  });
  it('recovers a dead worker lease and ignores its stale completion', async () => {
    await createTestRequest(org, user);
    const [stale] = await claimWebhookDeliveries({ orgId: org.id });
    await query("UPDATE webhook_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [stale.id]);
    await processWebhookOutbox({ orgId: org.id });
    await deliverClaimedWebhook(stale);
    expect(postWebhook).toHaveBeenCalledTimes(1);
    const attempts = await query('SELECT outcome FROM webhook_delivery_attempts WHERE delivery_id=$1 ORDER BY attempt_number', [stale.id]);
    expect(attempts.rows).toEqual([{ outcome: 'INTERRUPTED' }, { outcome: 'SUCCEEDED' }]);
  });
  it('stops after five transient failures and preserves attempt history on manual redelivery', async () => {
    await createTestRequest(org, user);
    vi.mocked(postWebhook).mockResolvedValue(503);
    for (let attempt = 0; attempt < 6; attempt++) {
      await query(`UPDATE webhook_deliveries SET next_attempt_at=clock_timestamp() WHERE event_id IN (SELECT id FROM webhook_events WHERE organization_id=$1)`, [org.id]);
      await processWebhookOutbox({ orgId: org.id });
    }
    expect(postWebhook).toHaveBeenCalledTimes(5);
    const { rows: [delivery] } = await query('SELECT d.* FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id WHERE e.organization_id=$1', [org.id]);
    expect(delivery.status).toBe('FAILED');
    const id = (await query('SELECT d.id FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id WHERE e.organization_id=$1', [org.id])).rows[0].id;
    expect(await redeliverWebhook(org.id, id)).toBe(true);
    vi.mocked(postWebhook).mockResolvedValue(200);
    await processWebhookOutbox({ orgId: org.id });
    const attempts = await query('SELECT outcome FROM webhook_delivery_attempts WHERE delivery_id=$1 ORDER BY attempt_number', [id]);
    expect(attempts.rows.map(row => row.outcome)).toEqual(['FAILED', 'FAILED', 'FAILED', 'FAILED', 'FAILED', 'SUCCEEDED']);
  });
  it('concurrent workers claim each delivery once', async () => {
    await createTestRequest(org, user);
    const results = await Promise.all([processWebhookOutbox({ orgId: org.id }), processWebhookOutbox({ orgId: org.id })]);
    expect(results.reduce((sum, item) => sum + item.processed, 0)).toBe(1);
    expect(postWebhook).toHaveBeenCalledTimes(1);
  });
  it('does not manually replay pending or successful deliveries', async () => {
    await createTestRequest(org, user);
    const id = (await query('SELECT d.id FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id WHERE e.organization_id=$1', [org.id])).rows[0].id;
    expect(await redeliverWebhook(org.id, id)).toBe(false);
    await processWebhookOutbox({ orgId: org.id });
    expect(await redeliverWebhook(org.id, id)).toBe(false);
    await processWebhookOutbox({ orgId: org.id });
    expect(postWebhook).toHaveBeenCalledTimes(1);
  });
  it('manual redelivery records an expired attempt as interrupted', async () => {
    await createTestRequest(org, user);
    const [claim] = await claimWebhookDeliveries({ orgId: org.id });
    expect(await redeliverWebhook(org.id, claim.id)).toBe(false);
    await query("UPDATE webhook_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [claim.id]);
    expect(await redeliverWebhook(org.id, claim.id)).toBe(true);
    await deliverClaimedWebhook(claim);
    expect(postWebhook).not.toHaveBeenCalled();
    await processWebhookOutbox({ orgId: org.id });
    const attempts = await query('SELECT outcome FROM webhook_delivery_attempts WHERE delivery_id=$1 ORDER BY attempt_number', [claim.id]);
    expect(attempts.rows.map(row => row.outcome)).toEqual(['INTERRUPTED', 'SUCCEEDED']);
  });
  it('sends a test only to its selected subscription, even when paused with different events', async () => {
    const selected = await query(`INSERT INTO webhook_subscriptions(organization_id,url,secret,events,is_active)
      VALUES($1,'https://example.com/selected','selected-secret','{epic.created}',false) RETURNING id`, [org.id]);
    try {
      const id = await enqueueWebhookTest(org.id, selected.rows[0].id);
      await processWebhookOutbox({ orgId: org.id, deliveryId: id });
      expect(postWebhook).toHaveBeenCalledTimes(1);
      expect(vi.mocked(postWebhook).mock.calls[0][0]).toBe('https://example.com/selected');
      expect(JSON.parse(vi.mocked(postWebhook).mock.calls[0][1]).event).toBe('webhook.test');
      const history = await listWebhookDeliveries(org.id, selected.rows[0].id);
      expect(history[0].status).toBe('SUCCEEDED');
      expect(JSON.stringify(history)).not.toContain('selected-secret');
    } finally { await query('DELETE FROM webhook_subscriptions WHERE id=$1', [selected.rows[0].id]); }
  });
});
