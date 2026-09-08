// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './route';
import { processWebhookOutbox } from '@/lib/api/webhook-outbox';
vi.mock('@/lib/api/webhook-outbox', () => ({ processWebhookOutbox: vi.fn(async () => ({ processed: 2 })) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('fails closed when the cron secret is missing', async () => {
  vi.stubEnv('CRON_SECRET', '');
  expect((await GET(new Request('https://example.com/api/cron/webhooks'))).status).toBe(503);
  expect(processWebhookOutbox).not.toHaveBeenCalled();
});
it('requires the cron bearer token', async () => {
  vi.stubEnv('CRON_SECRET', 'secret');
  expect((await GET(new Request('https://example.com/api/cron/webhooks', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
  expect(processWebhookOutbox).not.toHaveBeenCalled();
});
it('waits for the authenticated delivery batch', async () => {
  vi.stubEnv('CRON_SECRET', 'secret');
  const response = await GET(new Request('https://example.com/api/cron/webhooks', { headers: { authorization: 'Bearer secret' } }));
  expect(await response.json()).toEqual({ processed: 2 });
  expect(processWebhookOutbox).toHaveBeenCalledWith({ limit: 20 });
});
