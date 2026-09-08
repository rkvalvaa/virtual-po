import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { readSeed } from './helpers/seed';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg } from '@/test/db-helpers';
import { createTemplate, updateTemplate } from '@/lib/db/queries/templates';
import { query } from '@/lib/db/pool';

test('an organization with all templates disabled can explicitly start exactly one draft', async ({ page }) => {
  const org = await createTestOrg('e2e-empty-templates');
  const owner = await createTestUser(org);
  try {
    const template = await createTemplate({ organizationId: org.id, name: 'Disabled template', category: 'CUSTOM' });
    await updateTemplate(template.id, { isActive: false });
    await loginAs(page, owner.email);
    await page.goto('/requests/new');
    expect((await query('SELECT id FROM feature_requests WHERE organization_id = $1', [org.id])).rows).toHaveLength(0);
    await page.getByRole('button', { name: /start from scratch/i }).click();
    await expect(page).toHaveURL(/\/requests\/[0-9a-f-]+\/workflow$/);
    await page.reload();
    expect((await query('SELECT id FROM feature_requests WHERE organization_id = $1', [org.id])).rows).toHaveLength(1);
  } finally { await cleanupTestOrg(org, [owner.id]); }
});

test('another organization cannot read or continue a saved request conversation', async ({ page }) => {
  const org = await createTestOrg('e2e-private-workflow');
  const owner = await createTestUser(org);
  const request = await createTestRequest(org, owner, 'Private conversation sentinel');
  try {
    await loginAs(page, readSeed().stakeholderEmail);
    const read = await page.request.get(`/requests/${request.id}/workflow`);
    expect(await read.text()).not.toContain('Private conversation sentinel');
    const write = await page.request.post('/api/agents/intake', { data: {
      requestId: request.id, messages: [{ id: 'foreign', role: 'user', parts: [{ type: 'text', text: 'Read the private conversation' }] }],
    } });
    expect(write.status()).toBe(403);
  } finally { await cleanupTestOrg(org, [owner.id]); }
});

test('complete intake, recover a failed assessment, review security and generate saved artifacts', async ({ page }) => {
  await loginAs(page, readSeed().stakeholderEmail);
  await page.goto('/requests/new');
  await page.getByLabel('Working title (optional)').fill(`E2E_WORKFLOW ${Date.now()}`);
  await page.getByRole('button', { name: /start from scratch/i }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]+\/workflow$/);
  await page.getByRole('textbox', { name: 'Message to agent' }).fill('E2E_WORKFLOW: Export the backlog as CSV. Please complete intake.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run assessment', exact: true }).click();
  await expect(page.getByText(/Something went wrong/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText(/Something went wrong/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry last message' }).click();
  await page.getByRole('button', { name: 'Run security review' }).click();
  await page.getByRole('button', { name: 'Generate epic and stories' }).click();
  await expect(page.getByRole('main').getByText('Workflow complete', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText('Workflow complete', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View request and results' }).click();
  await page.getByRole('tab', { name: /epic/i }).click();
  await expect(page.getByText('CSV backlog export', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /stories/i }).click();
  await expect(page.getByText('Download backlog CSV', { exact: true })).toBeVisible();
});
