import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { readSeed } from './helpers/seed';
import { createTestApiKey, createTestOrg, createTestUser, cleanupTestOrg } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { loginAs } from './helpers/auth';

test('machine endpoints authenticate without browser cookies through the real proxy', async ({ request }) => {
  const seed = readSeed();
  const key = await createTestApiKey({ id: seed.orgId, slug: seed.orgSlug }, ['read']);
  const api = await request.get('/api/v1/requests', {
    headers: { Authorization: `Bearer ${key.key}` }, maxRedirects: 0,
  });
  expect(api.status()).toBe(200);
  expect((await request.get('/api/v1/requests', { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get('/api/health', { maxRedirects: 0 })).status()).toBe(200);

  const cron = await request.get('/api/cron/review-cycles', {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? 'e2e-cron-secret'}` }, maxRedirects: 0,
  });
  expect(cron.status()).toBe(200);
  expect((await request.get('/api/cron/review-cycles', { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get('/api/cron/webhooks', { maxRedirects: 0 })).status()).toBe(401);

  const body = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = 'v0=' + crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET ?? 'e2e-slack-secret')
    .update(`v0:${timestamp}:${body}`).digest('hex');
  const slack = await request.post('/api/slack/events', {
    headers: { 'Content-Type': 'application/json', 'X-Slack-Request-Timestamp': timestamp, 'X-Slack-Signature': signature },
    data: body, maxRedirects: 0,
  });
  expect(slack.status()).toBe(200);
  expect(await slack.json()).toEqual({ ok: true });
  expect((await request.post('/api/slack/events', { data: body, maxRedirects: 0 })).status()).toBe(401);
  expect((await request.post('/api/slack/events', {
    data: { type: 'url_verification', challenge: 'unsigned' }, maxRedirects: 0,
  })).status()).toBe(401);
  const teams = await request.post('/api/teams/messages', { data: { type: 'message' }, maxRedirects: 0 });
  expect([302, 303, 307]).toContain(teams.status());
  expect(teams.headers().location).toContain('/login');
  const dashboard = await request.get('/requests', { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(dashboard.status());
  expect(dashboard.headers().location).toContain('/login');
});

test('an open admin page cannot mutate after demotion, and removed members lose API access', async ({ page }) => {
  const org = await createTestOrg('e2e-revocation');
  const user = await createTestUser(org, 'ADMIN');
  try {
    await loginAs(page, user.email);
    await page.goto('/settings');
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API Keys', exact: true }).click();
    await page.getByRole('button', { name: 'Create API Key', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Must not be created');
    // Keep the old UI and cookie: only the database membership changes.
    await query("UPDATE organization_users SET role = 'STAKEHOLDER' WHERE organization_id = $1 AND user_id = $2", [org.id, user.id]);
    await page.getByRole('button', { name: 'Create Key', exact: true }).click();
    await expect(page.getByText('Only admins can create API keys.')).toBeAttached();
    expect((await query('SELECT id FROM api_keys WHERE organization_id = $1', [org.id])).rows).toHaveLength(0);

    await query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [org.id, user.id]);
    const response = await page.request.get('/api/export/requests', { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    await page.goto('/requests');
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await cleanupTestOrg(org, [user.id]);
  }
});
