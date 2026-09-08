import { test, expect } from '@playwright/test';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { loginAs } from './helpers/auth';

test('agent limits return explicit HTTP errors and actionable chat feedback', async ({ page }) => {
  const org = await createTestOrg('e2e-limits');
  const user = await createTestUser(org);
  const request = await createTestRequest(org, user);
  const message = { id: 'input', role: 'user', parts: [{ type: 'text', text: 'Hello' }] };
  try {
    await loginAs(page, user.email);
    const oversized = await page.request.post('/api/agents/intake', { data: { requestId: request.id, messages: [message], padding: 'x'.repeat(128 * 1024) } });
    expect(oversized.status()).toBe(413);
    const malformed = await page.request.post('/api/agents/intake', { data: { requestId: request.id, messages: [null] } });
    expect(malformed.status()).toBe(400);
    await query(`INSERT INTO agent_runs(request_id, organization_id, user_id, agent, status)
      SELECT $1, $2, $3, 'intake', 'FAILED' FROM generate_series(1, 60)`, [request.id, org.id, user.id]);
    const quota = await page.request.post('/api/agents/intake', { data: { requestId: request.id, messages: [message] } });
    expect(quota.status()).toBe(429);
    expect(quota.headers()['retry-after']).toBe('3600');
    await page.goto(`/requests/${request.id}/workflow`);
    await page.getByRole('textbox', { name: 'Message to agent' }).fill('Help with this request');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('main').getByText('Hourly AI limit reached. Please retry in one hour.', { exact: true })).toBeVisible();
  } finally { await cleanupTestOrg(org, [user.id]); }
});
