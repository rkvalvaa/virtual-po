import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestChangeRequest, createTestOrg, createTestUser } from '@/test/db-helpers';
import { createServiceGroup, setGroupMember } from '@/lib/db/queries/service-groups';
import { query } from '@/lib/db/pool';

test('a group member claims a change request from the queue; others cannot see it', async ({ page, browser }) => {
  const org = await createTestOrg('e2e-service-queue');
  const admin = await createTestUser(org, 'ADMIN');
  const member = await createTestUser(org, 'STAKEHOLDER');
  const outsider = await createTestUser(org, 'REVIEWER');
  const { id: groupId } = await createServiceGroup(org.id, admin.id, { name: 'IT Operations', fallbackOwnerId: admin.id });
  await setGroupMember(org.id, admin.id, groupId, { userId: member.id, role: 'MEMBER' });
  const { id } = await createTestChangeRequest(org, admin, 'Replace the badge readers');
  await query('UPDATE feature_requests SET service_group_id = $2 WHERE id = $1', [id, groupId]);
  try {
    await loginAs(page, member.email);
    await page.goto('/queue');
    const queue = page.getByRole('region', { name: 'IT Operations queue' });
    await expect(queue.getByRole('link', { name: 'Replace the badge readers' })).toBeVisible();
    await expect(queue.getByText(/^Unassigned/)).toBeVisible();
    await queue.getByRole('button', { name: 'Claim Replace the badge readers' }).click();
    await expect(queue.getByText(/^Assigned to /)).toBeVisible();
    expect((await query('SELECT assignee_id FROM feature_requests WHERE id = $1', [id])).rows[0].assignee_id).toBe(member.id);

    const other = await browser.newPage();
    try {
      await loginAs(other, outsider.email);
      await other.goto('/queue');
      await expect(other.getByRole('main').getByText(/not in any service group/)).toBeVisible();
      await other.goto(`/queue?group=${groupId}`);
      await expect(other.getByRole('main').getByText('Replace the badge readers')).toHaveCount(0);
    } finally { await other.close(); }
  } finally {
    await cleanupTestOrg(org, [admin.id, member.id, outsider.id]);
  }
});
