import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { createEpic, createUserStory } from '@/lib/db/queries/epics';
import { createInvitation } from '@/lib/db/queries/invitations';

async function section(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name, exact: true }).click();
}

test('admin saves organization and scoring policy, with persisted reload and cancel', async ({ page }) => {
  const org = await createTestOrg('editable-org'), admin = await createTestUser(org, 'ADMIN');
  try {
    await loginAs(page, admin.email);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Edit name' }).click();
    await page.getByLabel('Organization name').fill('Human named workspace');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('status')).toHaveText('Organization name saved.');
    await page.reload();
    await expect(page.getByRole('region', { name: 'Organization settings' })).toContainText('Human named workspace');
    await page.getByRole('button', { name: 'Edit name' }).click();
    await page.getByLabel('Organization name').fill('Discard this');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Organization settings' })).not.toContainText('Discard this');
    await section(page, 'Scoring');
    await page.getByLabel('Framework', { exact: true }).selectOption('WSJF');
    await page.getByLabel('High priority threshold').fill('90');
    await page.getByRole('button', { name: 'Save scoring policy' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved scoring policy version 1.');
    await page.reload();
    await section(page, 'Scoring');
    await expect(page.getByLabel('Framework', { exact: true })).toHaveValue('WSJF');
    await expect(page.getByLabel('High priority threshold')).toHaveValue('90');
  } finally { await page.goto('/'); await cleanupTestOrg(org, [admin.id]); }
});

test('human refinement saves all story fields and stale editor cannot overwrite it', async ({ page, context }) => {
  const org = await createTestOrg('refine-browser'), admin = await createTestUser(org, 'ADMIN');
  const request = await createTestRequest(org, admin, 'Original request');
  await query("UPDATE feature_requests SET status='UNDER_REVIEW', intake_complete=true, assessment_data='{}' WHERE id=$1", [request.id]);
  const epic = await createEpic({ requestId: request.id, title: 'Original epic' });
  await createUserStory({ epicId: epic.id, title: 'Original story', asA: 'user', iWant: 'a thing', soThat: 'it helps' }, { requestId: request.id, orgId: org.id });
  const stale = await context.newPage();
  try {
    await loginAs(page, admin.email);
    await page.goto(`/requests/${request.id}/edit`);
    await stale.goto(`/requests/${request.id}/edit`);
    await page.getByLabel('Epic title', { exact: true }).fill('Accepted epic');
    await page.getByLabel('Story 1 acceptance criteria (one per line)').fill('First criterion\nSecond criterion');
    await page.getByLabel('Story 1 points', { exact: true }).fill('8');
    await page.getByRole('button', { name: 'Save revision' }).click();
    await expect(page).toHaveURL(`/requests/${request.id}`);
    await page.goto(`/requests/${request.id}/edit`);
    await expect(page.getByLabel('Epic title', { exact: true })).toHaveValue('Accepted epic');
    await expect(page.getByLabel('Story 1 points', { exact: true })).toHaveValue('8');
    await stale.getByLabel('Epic title', { exact: true }).fill('Stale overwrite');
    await stale.getByRole('button', { name: 'Save revision' }).click();
    await expect(stale.getByRole('main').getByRole('alert')).toContainText('This request changed');
  } finally { await stale.close(); await page.goto('/'); await cleanupTestOrg(org, [admin.id]); }
});

for (const newAccount of [false, true]) test(`invitation joins the destination and preserves memberships (${newAccount ? 'new account' : 'existing account'})`, async ({ page }) => {
  const original = await createTestOrg('original-workspace'), destination = await createTestOrg('invited-workspace');
  const recipient = await createTestUser(original, 'ADMIN'), inviter = await createTestUser(destination, 'ADMIN');
  if (newAccount) await query('DELETE FROM organization_users WHERE user_id=$1', [recipient.id]);
  const invitation = await createInvitation(destination.id, inviter.id, recipient.email, 'REVIEWER');
  try {
    await loginAs(page, recipient.email);
    await page.goto(`/invite/${invitation.token}`);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page).toHaveURL('/requests');
    await page.goto('/settings');
    await expect(page.getByRole('region', { name: 'Organization settings' })).toContainText('invited-workspace');
    expect((await query('SELECT organization_id FROM organization_users WHERE user_id=$1', [recipient.id])).rows).toHaveLength(2);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit name' })).toHaveCount(0);
  } finally {
    await page.goto('/');
    if (newAccount) {
      const personal = await query('SELECT o.id, o.slug FROM organizations o JOIN organization_users m ON m.organization_id=o.id WHERE m.user_id=$1 AND o.id<>$2', [recipient.id, destination.id]);
      for (const row of personal.rows) await cleanupTestOrg({ id: row.id, slug: row.slug });
    }
    await cleanupTestOrg(destination, [inviter.id]); await cleanupTestOrg(original, [recipient.id]);
  }
});

test('review queue includes older high priority requests and clears selection across pages', async ({ page }) => {
  const org = await createTestOrg('queue-browser'), reviewer = await createTestUser(org, 'REVIEWER');
  try {
    await query(`INSERT INTO feature_requests(organization_id, requester_id, title, status, priority_score, created_at)
      SELECT $1, $2, 'Queue item ' || n, CASE WHEN n % 2 = 0 THEN 'NEEDS_INFO' ELSE 'UNDER_REVIEW' END,
      n, NOW() - n * interval '1 day' FROM generate_series(1, 53) n`, [org.id, reviewer.id]);
    await loginAs(page, reviewer.email);
    await page.goto('/review');
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows.nth(1)).toContainText('Queue item 53');
    await expect(rows).toHaveCount(26);
    await page.getByRole('checkbox').first().click();
    await expect(page.getByText('25 selected', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(rows.nth(1)).toContainText('Queue item 28');
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
    await page.getByLabel('Search requests').fill('Queue item 53');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('Queue item 53');
  } finally { await page.goto('/'); await cleanupTestOrg(org, [reviewer.id]); }
});
