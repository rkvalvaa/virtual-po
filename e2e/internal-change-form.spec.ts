import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestOrg, createTestUser } from '@/test/db-helpers';
import { createInternalForm, publishForm } from '@/lib/db/queries/intake-forms';
import { createServiceGroup } from '@/lib/db/queries/service-groups';
import { query } from '@/lib/db/pool';

test('a member files a change request from an internal form and lands on its workflow', async ({ page }) => {
  const org = await createTestOrg('e2e-internal-form');
  const admin = await createTestUser(org, 'ADMIN');
  const member = await createTestUser(org, 'STAKEHOLDER');
  const { id: groupId } = await createServiceGroup(org.id, admin.id, { name: 'IT Operations', fallbackOwnerId: admin.id });
  const { id: formId } = await createInternalForm(org.id, admin.id, groupId, 'IT change request');
  await publishForm(org.id, admin.id, formId);
  try {
    await loginAs(page, member.email);
    await page.goto('/requests/new');
    const forms = page.getByRole('region', { name: 'Request forms' });
    await expect(forms).toContainText('IT Operations');
    await forms.getByRole('link', { name: 'IT change request' }).click();

    const main = page.getByRole('main');
    await expect(main.getByText('Goes to IT Operations as a change request.')).toBeVisible();
    await main.getByLabel(/Change summary/).fill('Replace the badge readers');
    await main.getByLabel(/Affected product, service or client/).fill('Oslo office');
    await main.getByLabel(/Reason for the change/).fill('The readers are end of life');
    await main.getByLabel(/^Scope/).fill('Two doors');
    await main.getByLabel(/Impact and risk/).fill('Doors open by key for an hour');
    await main.getByRole('button', { name: /submit/i }).click();

    await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    await expect(main.getByRole('heading', { name: 'Replace the badge readers' })).toBeVisible();
    await expect(main.getByText('Change request', { exact: true })).toBeVisible();
    await expect(main.getByText('Submitted', { exact: true })).toBeVisible();

    const row = (await query(`SELECT request_type, service_group_id, requester_id FROM feature_requests
      WHERE organization_id = $1 AND source_form_id = $2`, [org.id, formId])).rows;
    expect(row).toEqual([{ request_type: 'CHANGE', service_group_id: groupId, requester_id: member.id }]);
  } finally {
    await cleanupTestOrg(org, [admin.id, member.id]);
  }
});
