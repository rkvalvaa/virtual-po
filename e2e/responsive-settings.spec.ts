import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { connectRepository } from '@/lib/db/queries/repositories';
import { upsertIntegration } from '@/lib/db/queries/jira-sync';
import { upsertTeamsNotification } from '@/lib/db/queries/teams';

const sections = ['Organization', 'Members', 'Repositories', 'Scoring', 'OKRs', 'Capacity', 'Templates', 'Custom Fields', 'Approvals', 'Review Cycles', 'Jira', 'Linear', 'GitHub Issues', 'Slack', 'Teams', 'API Keys', 'Webhooks', 'Email'];
async function noOverflow(page: Page) {
  // Retry the actual layout assertion, as with other browser UI checks.
  await expect(async () => {
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll('body *')]
        .filter(element => element.getBoundingClientRect().right + scrollX > innerWidth + 1)
        .slice(0, 12)
        .map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 60) })),
    }));
    expect(dimensions.scroll, JSON.stringify(dimensions.overflowing)).toBeLessThanOrEqual(dimensions.width + 1);
  }).toPass({ timeout: 5000 }).catch(async error => {
    console.log('Overflow diagnosis', await page.evaluate(() => {
      const elements: Element[] = [];
      function collect(root: Document | ShadowRoot) {
        for (const element of root.querySelectorAll('*')) {
          elements.push(element);
          if (element.shadowRoot) collect(element.shadowRoot);
        }
      }
      collect(document);
      const overflowing = elements.filter(element => element.scrollWidth > element.clientWidth + 1)
        .map(element => ({ tag: element.tagName, class: element.getAttribute('class'), width: element.clientWidth, scroll: element.scrollWidth, overflow: getComputedStyle(element).overflowX }));
      const clipping: object[] = [];
      for (const element of elements) {
        if (!(element instanceof HTMLElement)) continue;
        const original = element.style.overflowX;
        element.style.overflowX = 'clip';
        const scroll = document.documentElement.scrollWidth;
        if (scroll <= document.documentElement.clientWidth + 1) clipping.push({ tag: element.tagName, class: element.className });
        element.style.overflowX = original;
      }
      return { overflowing, clipping, scrollX, scrollY };
    }));
    throw error;
  });
}

for (const width of [390, 768, 1366]) test(`settings sections and intake remain usable at ${width}px`, async ({ page }, testInfo) => {
  const org = await createTestOrg('responsive');
  const admin = await createTestUser(org, 'ADMIN');
  const request = await createTestRequest(org, admin, 'Responsive intake');
  try {
    await query(`INSERT INTO webhook_subscriptions(organization_id,url,secret,events)
      VALUES($1,'https://example.com/a-long-webhook-path-for-overflow-verification','test-only-secret','{request.created,assessment.completed}')`, [org.id]);
    await connectRepository(org.id, 42, 'a-long-organization-name', 'a-long-repository-name', 'a-long-organization-name/a-long-repository-name', 'main', admin.id);
    await page.setViewportSize({ width, height: 900 });
    await loginAs(page, admin.email);
    await page.goto('/settings');
    for (const label of sections) {
      if (width < 1024) await page.getByLabel('Settings section', { exact: true }).selectOption({ label });
      else await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('region', { name: `${label} settings`, exact: true })).toBeVisible();
      await noOverflow(page);
    }
    await page.goto(`/requests/${request.id}/workflow`);
    const input = page.getByRole('textbox', { name: 'Message to agent' });
    await input.fill('A feature request with readable text');
    await expect(input).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    expect((await input.boundingBox())!.width).toBeGreaterThan(150);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`intake-${width}.png`), fullPage: true });
    await page.goto(`/requests/${request.id}`);
    for (const tab of await page.getByRole('tablist', { name: 'Request details' }).getByRole('tab').all()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await noOverflow(page);
    }
    await page.goto('/settings');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const label of sections) {
      if (width < 1024) await page.getByLabel('Settings section', { exact: true }).selectOption({ label });
      else await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('region', { name: `${label} settings`, exact: true })).toBeVisible();
      await noOverflow(page);
    }
    if (width < 1024) {
      await page.getByLabel('Settings section', { exact: true }).focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('region', { name: 'Organization settings', exact: true })).toBeVisible();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('region', { name: 'Email settings', exact: true })).toBeVisible();
    } else {
      await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Organization', exact: true }).click();
      const link = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Email', exact: true });
      await link.focus();
      await page.keyboard.press('Enter');
      await expect(link).toBeFocused();
      await expect(page.getByRole('region', { name: 'Email settings', exact: true })).toBeVisible();
    }
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`settings-text-zoom-${width}.png`), fullPage: true });
    await page.goto(`/requests/${request.id}`);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const tab of await page.getByRole('tablist', { name: 'Request details' }).getByRole('tab').all()) {
      await tab.focus();
      await page.keyboard.press('Enter');
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await noOverflow(page);
    }
    await page.goto(`/requests/${request.id}/workflow`);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByRole('textbox', { name: 'Message to agent' }).fill('Readable at 200% text');
    await page.getByRole('button', { name: 'Send', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeInViewport();
    await noOverflow(page);
    await page.goto('/');
  } finally { await cleanupTestOrg(org, [admin.id]); }
});

test('Teams setup is explicit about unavailable commands and never creates a request from an activity', async ({ page }) => {
  const org = await createTestOrg('teams-unavailable');
  const admin = await createTestUser(org, 'ADMIN');
  try {
    await loginAs(page, admin.email);
    await page.goto('/settings');
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Teams', exact: true }).click();
    await expect(page.getByText('Bot commands and automatic event notifications are unavailable.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a request', exact: true })).toHaveAttribute('href', '/requests/new');
    const response = await page.request.post('/api/teams/messages', { data: { type: 'message', text: '/vpo submit False success' } });
    expect(response.status()).toBe(503);
    expect((await response.json()).code).toBe('TEAMS_COMMANDS_UNAVAILABLE');
    const sentinel = 'private-teams-webhook-credential-sentinel';
    await upsertIntegration(org.id, 'TEAMS', 'Microsoft Teams', { webhookUrl: `https://example.com/${sentinel}` });
    await upsertTeamsNotification(org.id, 'Private channel', `https://example.com/${sentinel}-notification`, 'REQUEST_CREATED');
    await query("UPDATE organization_users SET role='STAKEHOLDER' WHERE organization_id=$1 AND user_id=$2", [org.id, admin.id]);
    const settingsResponse = await page.request.get('/settings');
    expect(settingsResponse.status()).toBe(200);
    expect(await settingsResponse.text()).not.toContain(sentinel);
    expect((await query('SELECT id FROM feature_requests WHERE organization_id=$1', [org.id])).rows).toHaveLength(0);
    await page.goto('/');
  } finally { await cleanupTestOrg(org, [admin.id]); }
});
