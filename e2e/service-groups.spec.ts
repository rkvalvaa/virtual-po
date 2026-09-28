import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestOrg, createTestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';

test('an admin sets up a service group with a fallback owner and a lead', async ({ page }) => {
  const org = await createTestOrg('e2e-service-groups');
  const admin = await createTestUser(org, 'ADMIN');
  const reviewer = await createTestUser(org, 'REVIEWER');
  try {
    await loginAs(page, admin.email);
    await page.goto('/settings#service-groups');
    const main = page.getByRole('main');
    await main.getByLabel('Group name').fill('IT Operations');
    await main.getByLabel('Fallback owner', { exact: true }).selectOption(admin.id);
    await main.getByRole('button', { name: 'Add group' }).click();

    const group = main.getByRole('region', { name: 'IT Operations' });
    await expect(group).toBeVisible();
    await group.getByLabel('Add member to IT Operations').selectOption(reviewer.id);
    await group.getByLabel('Role in IT Operations').selectOption('LEAD');
    await group.getByRole('button', { name: 'Add to IT Operations' }).click();
    await expect(group.getByText(/· Lead/)).toBeVisible();

    const stored = await query(`SELECT g.name, g.fallback_owner_id, m.user_id, m.role FROM service_groups g
      JOIN service_group_members m ON m.group_id = g.id WHERE g.organization_id = $1`, [org.id]);
    expect(stored.rows).toEqual([{ name: 'IT Operations', fallback_owner_id: admin.id, user_id: reviewer.id, role: 'LEAD' }]);
  } finally {
    await cleanupTestOrg(org, [admin.id, reviewer.id]);
  }
});
