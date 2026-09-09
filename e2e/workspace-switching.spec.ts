import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';

test('workspace switching refreshes roles, notifications, other tabs and future sign-ins', async ({ page, context }) => {
  page.on('dialog', dialog => dialog.accept());
  const original = await createTestOrg('Engineering workspace');
  const destination = await createTestOrg('Research workspace');
  const foreign = await createTestOrg('Unrelated workspace');
  const user = await createTestUser(original, 'ADMIN');
  await query("INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,'STAKEHOLDER')", [destination.id, user.id]);
  await createTestRequest(original, user, 'Engineering private request');
  await createTestRequest(destination, user, 'Research private request');
  await query(`INSERT INTO notifications (organization_id,user_id,type,title,message) VALUES
    ($1,$3,'STATUS_CHANGED','Engineering notification','First workspace'),
    ($2,$3,'STATUS_CHANGED','Research notification','Second workspace')`, [original.id, destination.id, user.id]);
  const otherTab = await context.newPage();
  try {
    await loginAs(page, user.email);
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Edit name' })).toBeVisible();
    await otherTab.goto('/settings');
    await expect(otherTab.getByRole('button', { name: 'Edit name' })).toBeVisible();
    await page.bringToFront();
    const selector = page.getByRole('combobox', { name: 'Workspace', exact: true });
    await expect(selector).toHaveValue(original.id);
    await expect(selector.getByRole('option')).toHaveCount(2);
    await expect(selector).not.toContainText('Unrelated');
    await selector.selectOption(destination.id);
    await expect(page).toHaveURL('/requests');
    await expect(selector).toHaveValue(destination.id);
    await expect(page.getByRole('main')).toContainText('Research private request');
    await expect(page.getByRole('main')).not.toContainText('Engineering private request');
    await page.getByRole('button', { name: /1 unread notifications/ }).click();
    await expect(page.getByText('Research notification', { exact: true })).toBeVisible();
    await expect(page.getByText('Engineering notification', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Edit name' })).toHaveCount(0);
    await otherTab.bringToFront();
    await expect(otherTab).toHaveURL('/requests');
    await expect(otherTab.getByRole('combobox', { name: 'Workspace', exact: true })).toHaveValue(destination.id);
    // A new sign-in uses the database preference, not a cached client choice.
    await page.bringToFront();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await loginAs(page, user.email);
    await expect(selector).toHaveValue(destination.id);
    // Revoking the selected membership invalidates the active token; the next
    // sign-in safely chooses the remaining membership without provisioning.
    await query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [destination.id, user.id]);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await loginAs(page, user.email);
    await expect(selector).toHaveValue(original.id);
    expect((await query('SELECT organization_id FROM organization_users WHERE user_id=$1', [user.id])).rows).toHaveLength(1);
  } finally {
    await otherTab.close();
    await page.goto('about:blank');
    await cleanupTestOrg(foreign);
    await cleanupTestOrg(destination);
    await cleanupTestOrg(original, [user.id]);
  }
});

test('mobile navigation identifies the active workspace and switches with native selection', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  const original = await createTestOrg('Mobile engineering');
  const destination = await createTestOrg('Mobile research');
  const user = await createTestUser(original, 'ADMIN');
  await query("INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,'REVIEWER')", [destination.id, user.id]);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, user.email);
    await expect(page.getByText('Mobile engineering', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('combobox', { name: 'Workspace', exact: true }).selectOption(destination.id);
    await expect(page.getByText('Mobile research', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('combobox', { name: 'Workspace', exact: true })).toHaveValue(destination.id);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  } finally {
    await page.goto('about:blank');
    await cleanupTestOrg(destination);
    await cleanupTestOrg(original, [user.id]);
  }
});

test('canceling a keyboard workspace switch preserves unsaved edits and server authorization', async ({ page }) => {
  const original = await createTestOrg('A workspace');
  const longName = 'Z Research workspace with a deliberately long name that must remain accessible in narrow navigation';
  const destination = await createTestOrg(longName);
  const user = await createTestUser(original, 'ADMIN');
  const request = await createTestRequest(original, user, 'Original title');
  await query("INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,'STAKEHOLDER')", [destination.id, user.id]);
  try {
    await loginAs(page, user.email);
    await page.goto(`/requests/${request.id}/edit`);
    await page.getByLabel('Request title', { exact: true }).fill('Unsaved title');
    const selector = page.getByRole('combobox', { name: 'Workspace', exact: true });
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Unsaved edits');
      await dialog.dismiss();
    });
    await selector.focus();
    await selector.press('ArrowDown');
    await selector.press('Enter');
    await expect(selector).toHaveValue(original.id);
    await expect(page.getByLabel('Request title', { exact: true })).toHaveValue('Unsaved title');
    const session = await (await page.request.get('/api/auth/workspace')).json();
    expect(session.user).toMatchObject({ orgId: original.id, role: 'ADMIN' });
    page.once('dialog', dialog => dialog.accept());
    await selector.press('ArrowDown');
    await selector.press('Enter');
    await expect(page).toHaveURL('/requests');
    await expect(selector).toHaveValue(destination.id);
    await expect(selector).toHaveAttribute('title', longName);
    expect((await query('SELECT title FROM feature_requests WHERE id=$1', [request.id])).rows[0].title).toBe('Original title');
  } finally {
    await page.goto('about:blank');
    await cleanupTestOrg(destination);
    await cleanupTestOrg(original, [user.id]);
  }
});
