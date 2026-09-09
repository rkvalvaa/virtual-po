import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';

test('archive and bulk restore preserve a draft and separate active queues', async ({ page }) => {
  const org = await createTestOrg('Archive workspace'), user = await createTestUser(org);
  const request = await createTestRequest(org, user, 'Abandoned draft to retain');
  try {
    await loginAs(page, user.email);
    await page.goto(`/requests/${request.id}`);
    await page.getByRole('button', { name: 'Archive request', exact: true }).click();
    await expect(page.getByText('Archived. History and attachments are retained. Restore to resume work.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Resume intake', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit Vote', exact: true })).toHaveCount(0);
    await page.goto('/requests');
    await expect(page.getByRole('link', { name: 'Abandoned draft to retain', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Archived requests', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Archived Requests', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select Abandoned draft to retain' }).click();
    await page.getByRole('button', { name: 'Restore selected', exact: true }).click();
    await expect(page.getByText('No archived requests', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Active requests', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Abandoned draft to retain', exact: true })).toBeVisible();
    expect((await query('SELECT status,archived_at FROM feature_requests WHERE id=$1', [request.id])).rows[0]).toMatchObject({ status: 'DRAFT', archived_at: null });
  } finally { await page.goto('about:blank'); await cleanupTestOrg(org, [user.id]); }
});
