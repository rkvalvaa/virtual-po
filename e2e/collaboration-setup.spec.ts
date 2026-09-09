import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';

test('setup dismisses and resumes with member-appropriate links and no sample requests', async ({ page }) => {
  const org = await createTestOrg('Setup workspace'), user = await createTestUser(org);
  try {
    await loginAs(page, user.email);
    const setup = page.getByRole('region', { name: 'Set up this workspace' });
    await expect(setup).toContainText('1 of 4 complete');
    await expect(setup.getByRole('link', { name: 'Open member settings' })).toHaveCount(0);
    await expect(setup.getByRole('link', { name: 'Create a request' })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss setup checklist' }).click();
    await expect(page.getByText('Setup checklist is hidden.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Setup checklist is hidden.')).toBeVisible();
    await page.getByRole('button', { name: 'Resume setup checklist' }).click();
    await expect(setup).toBeVisible();
    expect((await query('SELECT id FROM feature_requests WHERE organization_id=$1', [org.id])).rowCount).toBe(0);
  } finally { await page.goto('about:blank'); await cleanupTestOrg(org, [user.id]); }
});

test('member mentions and following persist, deduplicate recipients, and retain departed names', async ({ page }) => {
  const org = await createTestOrg('Collaborating workspace'), owner = await createTestUser(org), peer = await createTestUser(org);
  const request = await createTestRequest(org, owner, 'Request with collaborators');
  await query("UPDATE users SET name='Alex Reviewer' WHERE id=$1", [peer.id]);
  await query('INSERT INTO request_subscriptions(organization_id,request_id,user_id) VALUES($1,$2,$3)', [org.id, request.id, peer.id]);
  try {
    await loginAs(page, owner.email);
    await page.goto(`/requests/${request.id}`);
    await page.getByRole('tab', { name: /Discussion/ }).click();
    await page.getByRole('button', { name: 'Follow request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unfollow request', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Mention teammate' }).selectOption(peer.id);
    await page.getByRole('button', { name: 'Add mention', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Comment text' })).toHaveValue('@Alex Reviewer ');
    await page.getByRole('textbox', { name: 'Comment text' }).fill('@Alex Reviewer please check the evidence.');
    await page.getByRole('button', { name: 'Post Comment', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Comment text' })).toHaveValue('');
    await expect(page.getByText('@Alex Reviewer please check the evidence.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await query('SELECT user_id FROM notifications WHERE request_id=$1', [request.id])).rows).toEqual([{ user_id: peer.id }]);
    await page.reload();
    await page.getByRole('tab', { name: /Discussion/ }).click();
    await expect(page.getByRole('button', { name: 'Unfollow request', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Unfollow request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Follow request', exact: true })).toBeVisible();
    await query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [org.id, peer.id]);
    await page.reload();
    await page.getByRole('tab', { name: /Discussion/ }).click();
    await expect(page.getByText('Mentioned: @Alex Reviewer', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Mention teammate' })).toHaveCount(0);
  } finally { await page.goto('about:blank'); await cleanupTestOrg(org, [owner.id, peer.id]); }
});
