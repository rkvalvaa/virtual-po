// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestOrg, createTestUser, cleanupTestOrg, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { createWebhookAction, testWebhookAction, rotateWebhookSecretAction, webhookDeliveryHistoryAction, redeliverWebhookAction } from './api-actions';
import { postWebhook } from '@/lib/api/webhook-http';
import { createHmac } from 'node:crypto';
const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'ADMIN' }));
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/api/webhook-destination', () => ({ validateWebhookDestination: vi.fn(async () => {}), InvalidWebhookDestination: class extends Error {} }));
vi.mock('@/lib/api/webhook-http', () => ({ postWebhook: vi.fn(async () => 200) }));
describe.skipIf(!hasDb())('webhook settings boundaries and truthful delivery', () => {
  let org: TestOrg, user: TestUser, id: string;
  beforeAll(async () => { org = await createTestOrg('webhook-actions'); user = await createTestUser(org, 'ADMIN'); Object.assign(actor, { id: user.id, orgId: org.id }); });
  beforeEach(async () => {
    actor.role = 'ADMIN';
    await query("UPDATE organization_users SET role='ADMIN' WHERE organization_id=$1 AND user_id=$2", [org.id, user.id]);
    await query('DELETE FROM webhook_subscriptions WHERE organization_id=$1', [org.id]);
    id = (await query(`INSERT INTO webhook_subscriptions(organization_id,url,secret,events) VALUES($1,'https://example.com/selected','original-secret','{epic.created}') RETURNING id`, [org.id])).rows[0].id;
    vi.mocked(postWebhook).mockReset().mockResolvedValue(200);
  });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });
  it.each(['STAKEHOLDER', 'REVIEWER'])('denies %s test, secret creation/rotation, history and redelivery', async role => {
    actor.role = role;
    for (const result of [await createWebhookAction('https://example.com/new', ['request.created']), await rotateWebhookSecretAction(id), await testWebhookAction(id), await webhookDeliveryHistoryAction(id), await redeliverWebhookAction(id)]) {
      expect(result.success).toBe(false);
      expect(result).not.toHaveProperty('secret');
    }
    expect(postWebhook).not.toHaveBeenCalled();
  });
  it('reports a tracked pending failure and sends only to the selected recipient', async () => {
    await query(`INSERT INTO webhook_subscriptions(organization_id,url,secret,events) VALUES($1,'https://example.com/other','other-secret','{request.created}')`, [org.id]);
    vi.mocked(postWebhook).mockResolvedValue(503);
    const result = await testWebhookAction(id);
    expect(result).toMatchObject({ success: false, status: 'PENDING' });
    expect(result.error).toContain('HTTP 503');
    expect(postWebhook).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postWebhook).mock.calls[0][0]).toBe('https://example.com/selected');
  });
  it('returns a new secret for creation and signs subsequent attempts with the rotated secret', async () => {
    const created = await createWebhookAction('https://example.com/new', ['request.created']);
    expect(created.secret).toMatch(/^[a-f0-9]{64}$/);
    const rotated = await rotateWebhookSecretAction(id);
    expect(rotated.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(await testWebhookAction(id)).toMatchObject({ success: true, status: 'SUCCEEDED' });
    const [, body, headers] = vi.mocked(postWebhook).mock.calls[0];
    expect(headers['X-Webhook-Signature']).toBe(createHmac('sha256', rotated.secret!).update(body).digest('hex'));
    const history = await webhookDeliveryHistoryAction(id);
    expect(JSON.stringify(history)).not.toContain(rotated.secret);
    expect(JSON.stringify(history)).not.toContain('original-secret');
  });
  it('rejects foreign subscriptions and redeliveries without sending or revealing a secret', async () => {
    const delivery = await testWebhookAction(id);
    const foreign = await createTestOrg('foreign-webhook');
    actor.orgId = foreign.id;
    try {
      vi.mocked(postWebhook).mockClear();
      expect(await testWebhookAction(id)).toMatchObject({ success: false });
      expect(await rotateWebhookSecretAction(id)).toMatchObject({ success: false });
      expect(await redeliverWebhookAction(delivery.deliveryId!)).toMatchObject({ success: false });
      expect(await webhookDeliveryHistoryAction(id)).toEqual({ success: true, deliveries: [] });
      expect(postWebhook).not.toHaveBeenCalled();
    } finally { actor.orgId = org.id; await cleanupTestOrg(foreign); }
  });
  it('rechecks database admin membership before rotating a secret', async () => {
    await query("UPDATE organization_users SET role='STAKEHOLDER' WHERE organization_id=$1 AND user_id=$2", [org.id, user.id]);
    expect(await rotateWebhookSecretAction(id)).toMatchObject({ success: false });
    expect((await query('SELECT secret FROM webhook_subscriptions WHERE id=$1', [id])).rows[0].secret).toBe('original-secret');
  });
});
